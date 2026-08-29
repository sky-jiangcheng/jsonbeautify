#!/usr/bin/env node
/* ==============================================================
   Bump version: single entry point for releases.

   Usage:  npm run bump -- 1.5.62
           node scripts/bump-version.js 1.5.62

   version.json 是唯一版本源。本脚本写入 version.json 后调用
   sync-versions.js 把版本同步到 package.json / Cargo.toml /
   Cargo.lock / tauri*.conf.json / sw.js，再跑 `node scripts/build.js`
   即可出一致产物。release.yml 的 version-gate 校验 tag 与这些文件一致。
============================================================== */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: node scripts/bump-version.js <new-version>');
    console.error('Example: npm run bump -- 1.5.62');
    process.exit(1);
}

if (!/^\d+\.\d+\.\d+$/.test(newVersion)) {
    console.error('Error: version must be in X.Y.Z format');
    process.exit(1);
}

const versionFile = path.join(ROOT, 'version.json');
fs.writeFileSync(versionFile, JSON.stringify({ version: newVersion }, null, 2) + '\n');
console.log(`BUMP version.json → ${newVersion}`);

execFileSync(process.execPath, [path.join(__dirname, 'sync-versions.js')], { stdio: 'inherit' });
