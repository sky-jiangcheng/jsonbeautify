#!/usr/bin/env node
/* ==============================================================
   Build number auto-increment

   读取 Info.plist 中的 CFBundleVersion, 写入新的 build number
   (默认 +1, 也可指定新值)。

   用法:
     node scripts/bump-build.js <Info.plist>            # +1
     node scripts/bump-build.js <Info.plist> <new>      # 设置为指定值
     node scripts/bump-build.js <Info.plist> --read     # 只读, 不修改
============================================================== */
const fs = require('fs');
const path = require('path');

const argv = process.argv.slice(2);
if (argv.length < 1 || argv[0] === '--help' || argv[0] === '-h') {
  console.error('Usage: node scripts/bump-build.js <Info.plist> [new-build-number|--read]');
  process.exit(2);
}

const plistPath = path.resolve(argv[0]);
if (!fs.existsSync(plistPath)) {
  console.error(`❌ File not found: ${plistPath}`);
  process.exit(2);
}

let content = fs.readFileSync(plistPath, 'utf-8');
const re = /(<key>CFBundleVersion<\/key>\s*<string>)([^<]+)(<\/string>)/;
const match = content.match(re);
if (!match) {
  console.error('❌ CFBundleVersion not found in ' + plistPath);
  process.exit(1);
}

const current = match[2];

if (argv[1] === '--read') {
  process.stdout.write(current);
  process.exit(0);
}

let next;
if (argv[1] !== undefined) {
  next = String(argv[1]);
  if (!/^\d+$/.test(next)) {
    console.error(`❌ Invalid build number: ${next} (must be integer)`);
    process.exit(1);
  }
} else {
  const n = parseInt(current, 10);
  if (isNaN(n)) {
    console.error(`❌ CFBundleVersion is not numeric: ${current}`);
    process.exit(1);
  }
  next = String(n + 1);
}

const updated = content.replace(re, `$1${next}$3`);
fs.writeFileSync(plistPath, updated);
console.log(`✓ ${path.relative(process.cwd(), plistPath)}: CFBundleVersion ${current} → ${next}`);
