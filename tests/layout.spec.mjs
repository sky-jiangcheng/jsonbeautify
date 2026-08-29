#!/usr/bin/env node
/* ==============================================================
   Layout smoke tests — 跨端布局回归的自动防线。

   覆盖本仓库历史上真实出过的事故类别：
     - Tauri 桌面壳误入 mobile UI → 状态栏消失 (v1.5.55~v1.5.59)
     - iPad 桌面风格 UA 被强制 desktop (v1.5.61 修复)
     - 桌面窄窗口设备层抖动 / 混合形态
     - 长文本滚动到底不可达

   运行: node scripts/build.js && node tests/layout.spec.mjs
   依赖: playwright-core + 系统 Chrome (channel), CI 与本地一致。
============================================================== */

import { chromium, devices } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(join(fileURLToPath(import.meta.url), '..', '..'));
const DIST = join(ROOT, 'dist');
const PORT = 8931;
const BASE = `http://127.0.0.1:${PORT}`;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
};

if (!existsSync(join(DIST, 'index.html'))) {
  console.error('dist/index.html 不存在 — 先跑 node scripts/build.js');
  process.exit(2);
}

const server = createServer((req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, BASE).pathname);
  let file = join(DIST, urlPath === '/' ? 'index.html' : urlPath);
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function newPage(browser, { viewport, tauri = false, deviceDescriptor = null } = {}) {
  const context = await browser.newContext({
    viewport: deviceDescriptor ? undefined : viewport,
    ...(deviceDescriptor || {}),
  });
  if (tauri) {
    await context.addInitScript(() => { window.__TAURI__ = { core: {} }; });
  }
  const page = await context.newPage();
  await page.goto(BASE + '/');
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(300);
  return { context, page };
}

async function scenario(name, fn) {
  console.log(`\n● ${name}`);
  try { await fn(); }
  catch (e) { failed++; console.error(`  ✗ 场景异常 — ${e.message}`); }
}

async function main() {
  await new Promise(r => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ channel: 'chrome' });

  const LONG_JSON = JSON.stringify({
    items: Array.from({ length: 300 }, (_, i) => ({
      id: i, name: 'item-' + i, desc: 'x'.repeat(80), tags: ['a', 'b', 'c'],
      nested: { deep: { value: i * 3 } },
    })),
  });

  await scenario('桌面 1280×800：三栏 + 状态栏', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    check('data-device=desktop', await page.getAttribute('html', 'data-device') === 'desktop');
    const sb = await page.locator('.statusbar').boundingBox();
    check('状态栏可见且贴底', !!sb && sb.height === 24 && Math.abs(sb.y + sb.height - 800) < 2,
      sb ? JSON.stringify(sb) : 'null');
    check('桌面顶栏可见', await page.locator('header.desktop-only').isVisible());
    check('移动工具条无高度', await page.evaluate(() => document.getElementById('mob-toolbar').getBoundingClientRect().height === 0));
    check('无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await context.close();
  });

  await scenario('桌面窄窗 860×800：保持桌面层 + CSS 堆叠，状态栏不丢', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 860, height: 800 } });
    check('data-device=desktop（不随宽度翻转）', await page.getAttribute('html', 'data-device') === 'desktop');
    const sb = await page.locator('.statusbar').boundingBox();
    check('状态栏可见且贴底', !!sb && sb.height === 24 && Math.abs(sb.y + sb.height - 800) < 2, sb ? JSON.stringify(sb) : 'null');
    check('编辑区已按宽度堆叠(@media)', await page.evaluate(() =>
      getComputedStyle(document.querySelector('.editor-area')).flexDirection === 'column'));
    await context.close();
  });

  await scenario('桌面极窄 390×800：桌面层可用，顶栏可横向滚动，无页面级溢出', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 800 } });
    check('data-device=desktop', await page.getAttribute('html', 'data-device') === 'desktop');
    const sb = await page.locator('.statusbar').boundingBox();
    check('状态栏可见且贴底', !!sb && sb.height === 24 && Math.abs(sb.y + sb.height - 800) < 2, sb ? JSON.stringify(sb) : 'null');
    check('顶栏按钮横向可达(工具条可滚动)', await page.evaluate(() => {
      const tb = document.querySelector('header.desktop-only .toolbar');
      return tb.scrollWidth >= tb.clientWidth - 1;
    }));
    check('无页面级横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await context.close();
  });

  await scenario('Tauri 桌面壳 860×800（v1.5.55~59 事故回归）：状态栏必须在', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 860, height: 800 }, tauri: true });
    check('data-device=desktop', await page.getAttribute('html', 'data-device') === 'desktop');
    const sb = await page.locator('.statusbar').boundingBox();
    check('状态栏可见且贴底', !!sb && sb.height === 24 && Math.abs(sb.y + sb.height - 800) < 2, sb ? JSON.stringify(sb) : 'null');
    check('移动 Tab 栏隐藏', await page.locator('#mob-tabs').isHidden());
    await context.close();
  });

  await scenario('手机 390×844：移动 UI + 长文本可滚到底', async () => {
    const { context, page } = await newPage(browser, { deviceDescriptor: devices['iPhone 13'] });
    check('data-device=mobile', await page.getAttribute('html', 'data-device') === 'mobile');
    check('状态栏按设计隐藏', await page.evaluate(() =>
      getComputedStyle(document.querySelector('.statusbar')).display === 'none'));
    check('移动工具条可见', await page.locator('#mob-toolbar').isVisible());

    // 长文本: 填入 → 格式化 → 输出能滚到底
    await page.fill('#input', LONG_JSON);
    await page.locator('#mob-toolbar [data-action="format"]').click();
    await page.waitForTimeout(500);
    const scrolled = await page.evaluate(() => {
      const oc = document.querySelector('.output-content');
      if (!oc) return { ok: false, why: 'no .output-content' };
      const before = oc.scrollTop;
      oc.scrollTop = oc.scrollHeight;
      const maxScroll = oc.scrollHeight - oc.clientHeight;
      const lastRect = oc.querySelector('pre, code, .json-tree')?.getBoundingClientRect();
      const toolbar = document.getElementById('mob-toolbar').getBoundingClientRect();
      const lastVisible = !lastRect || lastRect.bottom <= toolbar.top + 2 || lastRect.bottom <= window.innerHeight;
      return { ok: Math.abs(oc.scrollTop - maxScroll) < 2 && maxScroll > 500 && lastVisible,
               scrollTop: oc.scrollTop, maxScroll, before };
    });
    check('长 JSON 输出可滚动到底且末行可见', scrolled.ok, JSON.stringify(scrolled));
    check('无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await context.close();
  });

  await scenario('iPad 竖屏 820×1180：触屏设备永远是 mobile（v1.5.61 事故回归）', async () => {
    const plain = await newPage(browser, { deviceDescriptor: devices['iPad Pro 11'] });
    check('无 Tauri: data-device=mobile', await plain.page.getAttribute('html', 'data-device') === 'mobile');
    await plain.context.close();

    const tauri = await newPage(browser, { deviceDescriptor: devices['iPad Pro 11'], tauri: true });
    check('Tauri 壳 + 桌面风格 UA 也不强制 desktop', await tauri.page.getAttribute('html', 'data-device') === 'mobile');
    await tauri.context.close();
  });

  await browser.close();
  server.close();

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
