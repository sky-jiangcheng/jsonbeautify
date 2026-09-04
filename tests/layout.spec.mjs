#!/usr/bin/env node
/* ==============================================================
   Layout smoke tests — 跨端布局回归的自动防线。

   UI 层规则 (v1.5.64):
     mobile 层 = 真触屏设备(UA/指针) 或 桌面浏览器视口 ≤900px
     desktop 层 = 其余; Tauri 桌面壳锁定 desktop (壳内宽度不可信)

   覆盖本仓库历史上真实出过的事故类别：
     - Tauri 桌面壳误入 mobile UI → 状态栏消失 (v1.5.55~v1.5.59)
     - iPad 桌面风格 UA 被强制 desktop (v1.5.61 修复)
     - 窄窗桌面层布局挤碎 / History 占屏 1/3 (v1.5.62~63)
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

let passed = 0, failed = 0;
function check(name, cond, detail) {
  if (cond) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; console.error(`  ✗ ${name}${detail ? ' — ' + detail : ''}`); }
}

async function newPage(browser, { viewport, tauri = false, deviceDescriptor = null, locale = null } = {}) {
  const context = await browser.newContext({
    viewport: deviceDescriptor ? undefined : viewport,
    locale: locale || undefined,
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

  await scenario('桌面浏览器 1280×800：desktop 层 + 状态栏', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 } });
    check('data-device=desktop', await page.getAttribute('html', 'data-device') === 'desktop');
    const sb = await page.locator('.statusbar').boundingBox();
    check('状态栏可见且贴底', !!sb && sb.height === 24 && Math.abs(sb.y + sb.height - 800) < 2,
      sb ? JSON.stringify(sb) : 'null');
    check('桌面顶栏可见', await page.locator('header.desktop-only').isVisible());
    check('无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await context.close();
  });

  await scenario('桌面浏览器窄窗 860×800：回退 mobile 层（移动设计完整）', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 860, height: 800 } });
    check('data-device=mobile', await page.getAttribute('html', 'data-device') === 'mobile');
    check('更多按钮可见', await page.locator('#mob-more-btn').isVisible());
    check('底部工具条可见', await page.locator('#mob-toolbar').isVisible());
    check('状态栏按设计隐藏', await page.evaluate(() =>
      getComputedStyle(document.querySelector('.statusbar')).display === 'none'));
    check('历史侧栏隐藏(走抽屉)', await page.evaluate(() =>
      getComputedStyle(document.querySelector('.sidebar')).display === 'none'));
    check('无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await context.close();
  });

  await scenario('桌面浏览器极窄 390×800：mobile 层完整可用', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 390, height: 800 } });
    check('data-device=mobile', await page.getAttribute('html', 'data-device') === 'mobile');
    check('更多按钮可见', await page.locator('#mob-more-btn').isVisible());
    check('状态栏按设计隐藏', await page.evaluate(() =>
      getComputedStyle(document.querySelector('.statusbar')).display === 'none'));
    check('无页面级横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await context.close();
  });

  await scenario('Tauri 桌面壳 860×800：锁定 desktop 层，状态栏必须在（v1.5.55~59 事故回归）', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 860, height: 800 }, tauri: true });
    check('data-device=desktop（壳内不随宽度切换）', await page.getAttribute('html', 'data-device') === 'desktop');
    const sb = await page.locator('.statusbar').boundingBox();
    check('状态栏可见且贴底', !!sb && sb.height === 24 && Math.abs(sb.y + sb.height - 800) < 2, sb ? JSON.stringify(sb) : 'null');
    check('移动 Tab 栏隐藏', await page.locator('#mob-tabs').isHidden());
    // 壳内窄窗使用桌面层堆叠布局, 结构完整性必须保证 (v1.5.63 修复回归)
    check('main-layout 已转纵向(@media)', await page.evaluate(() =>
      getComputedStyle(document.querySelector('.main-layout')).flexDirection === 'column'));
    check('输入面板有实际高度(不被侧栏挤碎)', await page.evaluate(() =>
      document.getElementById('input-panel').getBoundingClientRect().height > 100));
    await context.close();
  });

  await scenario('Tauri v2 IPC bridge 单独存在（__TAURI_INTERNALS__）也锁定 desktop，修复 App Store 状态栏消失', async () => {
    const context = await browser.newContext({ viewport: { width: 860, height: 800 } });
    await context.addInitScript(() => {
      // 模拟 App Store 构建中 __TAURI__ 全局不可用、只有内部 IPC 桥的场景
      window.__TAURI_INTERNALS__ = { invoke: function () {}, transformCallback: function () {} };
    });
    const page = await context.newPage();
    await page.goto(BASE + '/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(300);
    check('data-device=desktop', await page.getAttribute('html', 'data-device') === 'desktop');
    const sb = await page.locator('.statusbar').boundingBox();
    check('状态栏可见且贴底', !!sb && sb.height === 24 && Math.abs(sb.y + sb.height - 800) < 2, sb ? JSON.stringify(sb) : 'null');
    check('移动 Tab 栏隐藏', await page.locator('#mob-tabs').isHidden());
    await context.close();
  });

  await scenario('手机 390×844：mobile UI + 长文本可滚到底', async () => {
    const { context, page } = await newPage(browser, { deviceDescriptor: devices['iPhone 13'] });
    check('data-device=mobile', await page.getAttribute('html', 'data-device') === 'mobile');
    check('状态栏按设计隐藏', await page.evaluate(() =>
      getComputedStyle(document.querySelector('.statusbar')).display === 'none'));
    check('更多按钮可见', await page.locator('#mob-more-btn').isVisible());

    // 长文本: 填入 → 格式化 → 输出能滚到底
    await page.fill('#input', LONG_JSON);
    await page.locator('#mob-toolbar [data-action="format"]').click();
    await page.waitForTimeout(500);
    const scrolled = await page.evaluate(() => {
      const oc = document.querySelector('.output-content');
      if (!oc) return { ok: false, why: 'no .output-content' };
      oc.scrollTop = oc.scrollHeight;
      const maxScroll = oc.scrollHeight - oc.clientHeight;
      const lastRect = oc.querySelector('pre, code, .json-tree')?.getBoundingClientRect();
      const toolbar = document.getElementById('mob-toolbar').getBoundingClientRect();
      const lastVisible = !lastRect || lastRect.bottom <= toolbar.top + 2 || lastRect.bottom <= window.innerHeight;
      return { ok: Math.abs(oc.scrollTop - maxScroll) < 2 && maxScroll > 500 && lastVisible,
               scrollTop: oc.scrollTop, maxScroll };
    });
    check('长 JSON 输出可滚动到底且末行可见', scrolled.ok, JSON.stringify(scrolled));
    check('无横向溢出', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await context.close();
  });

  await scenario('Tauri 桌面壳粘贴超长 JSON：顶栏与面板标题不能滚出视口', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1200, height: 800 }, tauri: true });
    check('data-device=desktop', await page.getAttribute('html', 'data-device') === 'desktop');
    const longJson = JSON.stringify({
      eventType: 'CONTACTS',
      residentialAddress: 'ROOM 314, BLOCK C, XIONGQIAO GARDEN, NO. 48 XUANZHEN ROAD, TAIHE TOWN, QINGXIN DISTRICT, QINGYUAN CITY, GUANGDONG PROVINCE, CHINA, 511873',
      residentialAddressCn: '中国广东省清远市清新区太和镇玄真路48号雄侨花园C幢之一1座314房',
      notes: 'x'.repeat(2000),
    });
    await page.fill('#input', longJson);
    await page.waitForTimeout(300);
    const headerBox = await page.locator('header.desktop-only').boundingBox();
    const panelHeaderBox = await page.locator('#input-panel .panel-header').boundingBox();
    check('桌面顶栏可见且贴顶', !!headerBox && headerBox.y === 0 && headerBox.height === 44,
      headerBox ? JSON.stringify(headerBox) : 'null');
    check('输入面板标题可见', !!panelHeaderBox && panelHeaderBox.y === 44 && panelHeaderBox.height === 32,
      panelHeaderBox ? JSON.stringify(panelHeaderBox) : 'null');
    check('页面无纵向滚动', await page.evaluate(() => window.scrollY === 0));
    check('html 无纵向滚动', await page.evaluate(() => document.documentElement.scrollTop === 0));
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

  await scenario('i18n：系统语言日语 → 默认日语 UI', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
    check('lang-btn data-lang=ja', await page.getAttribute('#lang-btn', 'data-lang') === 'ja');
    check('格式化按钮显示「整形」', (await page.locator('[data-i18n="format"]').first().textContent()) === '整形');
    check('标题为 JSON Formatter', (await page.title()) === 'JSON Formatter');
    await context.close();
  });

  await scenario('i18n：系统语言西班牙语 → 默认西班牙语 UI', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 }, locale: 'es-ES' });
    check('lang-btn data-lang=es', await page.getAttribute('#lang-btn', 'data-lang') === 'es');
    check('格式化按钮显示「Formatear」', (await page.locator('[data-i18n="format"]').first().textContent()) === 'Formatear');
    await context.close();
  });

  await scenario('i18n：系统语言德语 → 默认德语 UI', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 }, locale: 'de-DE' });
    check('lang-btn data-lang=de', await page.getAttribute('#lang-btn', 'data-lang') === 'de');
    check('格式化按钮显示「Formatieren」', (await page.locator('[data-i18n="format"]').first().textContent()) === 'Formatieren');
    await context.close();
  });

  await scenario('i18n：不支持的语言(法语) → fallback 英语', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 }, locale: 'fr-FR' });
    check('lang-btn data-lang=en (fallback)', await page.getAttribute('#lang-btn', 'data-lang') === 'en');
    check('格式化按钮显示「Format」', (await page.locator('[data-i18n="format"]').first().textContent()) === 'Format');
    await context.close();
  });

  await scenario('i18n：语言选择器弹出 + 切换 + 持久化', async () => {
    const { context, page } = await newPage(browser, { viewport: { width: 1280, height: 800 }, locale: 'ja-JP' });
    await page.click('#lang-btn');
    check('语言菜单弹出', await page.locator('#lang-menu').isVisible());
    const items = await page.locator('.lang-menu-item').count();
    check('含 5 种语言(中/英/西/德/日)', items === 5, 'count=' + items);
    check('当前项高亮为日本語', (await page.locator('.lang-menu-item.active').textContent()) === '日本語');
    await page.click('.lang-menu-item[data-lang="en"]');
    check('切换后格式化按钮=Format', (await page.locator('[data-i18n="format"]').first().textContent()) === 'Format');
    check('lang-btn 变为 English', (await page.getAttribute('#lang-btn', 'data-lang')) === 'en');
    check('菜单已关闭', !(await page.locator('#lang-menu').isVisible()));
    await page.reload();
    await page.waitForTimeout(300);
    check('刷新后仍保持 English(持久化)', (await page.getAttribute('#lang-btn', 'data-lang')) === 'en');
    await context.close();
  });

  await browser.close();
  server.close();

  console.log(`\n结果: ${passed} 通过, ${failed} 失败`);
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(2); });
