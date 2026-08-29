#!/usr/bin/env node
/* ==============================================================
   Sync version.json → all version-bearing files (single source).

   发版只改 version.json，然后跑 `node scripts/build.js`（内部会调用本脚本）。
   覆盖文件与 v1.5.59 时代手动 bump 的清单一致：
     - package.json
     - src-tauri/Cargo.toml
     - src-tauri/Cargo.lock   (仅 json-formatter 包条目)
     - src-tauri/tauri.conf.json
     - src-tauri/tauri.appstore.conf.json
     - src-tauri/tauri.ios.conf.json
     - sw.js (CACHE_NAME)
   release.yml 的 version-gate 会校验 tag 与这些文件一致。
============================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const VERSION_FILE = path.join(ROOT, 'version.json');

function read(p) { return fs.readFileSync(p, 'utf-8'); }
function write(p, content, version) {
    const abs = path.join(ROOT, p);
    const before = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf-8') : null;
    if (before === content) { console.log(`  SKIP ${p} (already ${version})`); return; }
    fs.writeFileSync(abs, content);
    console.log(`  SYNC ${p}`);
}

function patchVersionedString(relPath, regex, version, label) {
    let content = read(relPath);
    if (!regex.test(content)) {
        throw new Error(`${relPath}: ${label} pattern not found — file layout changed?`);
    }
    content = content.replace(regex, (m, p1, _old, p3) => `${p1}${version}${p3}`);
    write(relPath, content, version);
}

function main() {
    const version = JSON.parse(read(VERSION_FILE)).version;
    if (!/^\d+\.\d+\.\d+$/.test(version)) {
        throw new Error(`version.json: invalid semver "${version}"`);
    }
    console.log(`Syncing version ${version} from version.json...\n`);

    patchVersionedString('package.json',
        /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/, version, 'version field');
    patchVersionedString('src-tauri/Cargo.toml',
        /^(version\s*=\s*")(\d+\.\d+\.\d+)(")/m, version, 'version field');
    patchVersionedString('src-tauri/tauri.conf.json',
        /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/, version, 'version field');
    patchVersionedString('src-tauri/tauri.appstore.conf.json',
        /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/, version, 'version field');
    patchVersionedString('src-tauri/tauri.ios.conf.json',
        /("version"\s*:\s*")(\d+\.\d+\.\d+)(")/, version, 'version field');
    patchVersionedString('sw.js',
        /(const CACHE_NAME = 'json-formatter-v)(\d+\.\d+\.\d+)(')/, version, 'CACHE_NAME');

    // Cargo.lock: 只改 json-formatter 包自己的 version 行（其他依赖不动）
    const lockPath = 'src-tauri/Cargo.lock';
    const lock = read(lockPath);
    const pkgRe = /(\[\[package\]\]\nname = "json-formatter"\nversion = ")(\d+\.\d+\.\d+)(")/;
    if (!pkgRe.test(lock)) throw new Error('Cargo.lock: json-formatter package entry not found');
    write(lockPath, lock.replace(pkgRe, (m, p1, p2, p3) => p1 + version + p3), version);

    console.log(`\nAll version files synced to ${version}.`);
}

main();
