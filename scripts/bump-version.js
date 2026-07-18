#!/usr/bin/env node
/* ==============================================================
   Bump version across all config files.
   Usage: node scripts/bump-version.js <new-version>
   Example: node scripts/bump-version.js 1.5.0
============================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const newVersion = process.argv[2];

if (!newVersion) {
    console.error('Usage: node scripts/bump-version.js <new-version>');
    console.error('Example: node scripts/bump-version.js 1.5.0');
    process.exit(1);
}

// Validate semver-like format
if (!/^\d+\.\d+\.\d+/.test(newVersion)) {
    console.error('Error: version must be in X.Y.Z format');
    process.exit(1);
}

const updates = [
    {
        file: 'package.json',
        pattern: /"version":\s*"\d+\.\d+\.\d+"/,
        replacement: `"version": "${newVersion}"`,
    },
    {
        file: 'src-tauri/tauri.conf.json',
        pattern: /"version":\s*"\d+\.\d+\.\d+"/,
        replacement: `"version": "${newVersion}"`,
    },
    {
        file: 'src-tauri/Cargo.toml',
        pattern: /version\s*=\s*"\d+\.\d+\.\d+"/,
        replacement: `version = "${newVersion}"`,
    },
];

let updated = 0;
for (const { file, pattern, replacement } of updates) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) {
        console.warn(`  SKIP ${file} (not found)`);
        continue;
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    if (!pattern.test(content)) {
        console.warn(`  SKIP ${file} (no version match found)`);
        continue;
    }
    const newContent = content.replace(pattern, replacement);
    fs.writeFileSync(filePath, newContent);
    console.log(`  BUMP ${file}: → ${newVersion}`);
    updated++;
}

if (updated === 0) {
    console.error('Error: no files were updated. Check the version pattern.');
    process.exit(1);
}

console.log(`\nBumped ${updated} files to version ${newVersion}.`);
