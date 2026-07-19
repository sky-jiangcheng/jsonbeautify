#!/usr/bin/env node
/* ==============================================================
   版本一致性检查 / 自动修复引擎

   三处版本号必须保持一致:
     - package.json              (web / npm)
     - src-tauri/tauri.conf.json (Tauri 主配置, 桌面/App Store 继承)
     - src-tauri/Cargo.toml     (Rust 包版本)

   子命令:
     check              检查三处是否一致 (不一致 -> exit 1)
     fix                以 package.json 为准, 把另外两处同步成一致
                         (复用 scripts/bump-version.js)
     tag [vX.Y.Z]      检查 tag 版本号(去掉 v) 是否等于文件当前版本
                         (发版门禁: 不一致则 exit 1, 防止上传错误/重复版本)

   退出码: 0 = 一致/成功, 1 = 不一致/失败, 2 = 参数/环境错误
============================================================== */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

const FILES = {
  'package.json': /"version":\s*"([^"]+)"/,
  'src-tauri/tauri.conf.json': /"version":\s*"([^"]+)"/,
  'src-tauri/Cargo.toml': /^\s*version\s*=\s*"([^"]+)"/m,
};

function readVersion(file, re) {
  const p = path.join(ROOT, file);
  if (!fs.existsSync(p)) return null;
  const m = fs.readFileSync(p, 'utf-8').match(re);
  return m ? m[1] : null;
}

function getAll() {
  const out = {};
  for (const [f, re] of Object.entries(FILES)) out[f] = readVersion(f, re);
  return out;
}

const cmd = process.argv[2];
const arg = process.argv[3];

if (cmd === 'check') {
  const v = getAll();
  console.log('版本现状:');
  for (const [f, ver] of Object.entries(v)) {
    console.log(`  ${f}: ${ver ?? '(缺失)'}`);
  }
  const vals = Object.values(v).filter((x) => x != null);
  const uniq = [...new Set(vals)];
  if (uniq.length <= 1) {
    console.log(`\n✅ 三处版本一致: ${uniq[0] ?? 'N/A'}`);
    process.exit(0);
  } else {
    console.error('\n❌ 版本不一致! 请以 package.json 为准统一 (运行 check-versions.js fix):');
    console.error('   ' + Object.entries(v).map(([f, x]) => `${f}=${x}`).join('\n   '));
    process.exit(1);
  }
} else if (cmd === 'fix') {
  const pkg = readVersion('package.json', FILES['package.json']);
  if (!pkg) {
    console.error('❌ 无法读取 package.json version');
    process.exit(1);
  }
  console.log(`以 package.json=${pkg} 为准, 同步其余文件...`);
  execFileSync('node', [path.join(ROOT, 'scripts', 'bump-version.js'), pkg], { stdio: 'inherit' });
  console.log('✅ 已同步');
  process.exit(0);
} else if (cmd === 'tag') {
  let tagVer = (arg || process.env.GITHUB_REF_NAME || '').replace(/^v/, '');
  const v = getAll();
  const fileVer = v['package.json'];
  console.log('tag 版本:   ' + (tagVer || '(未提供)'));
  console.log('文件版本:   ' + (fileVer ?? '(缺失)'));
  if (!tagVer) {
    console.error('\n❌ 未提供 tag 版本 (用法: check-versions.js tag v1.5.1)');
    process.exit(2);
  }
  if (tagVer !== fileVer) {
    console.error(`\n❌ tag 版本(${tagVer}) 与文件版本(${fileVer}) 不一致!`);
    console.error('   请先 bump 版本到 ' + tagVer + ' 再打 tag,');
    console.error('   否则构建会上传错误/重复的版本号到 App Store。');
    process.exit(1);
  }
  console.log('\n✅ tag 版本与文件一致');
  process.exit(0);
} else {
  console.error('Usage: node scripts/check-versions.js <check|fix|tag> [vX.Y.Z]');
  process.exit(2);
}
