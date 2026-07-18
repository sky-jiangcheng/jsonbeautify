#!/usr/bin/env node
/* ==============================================================
   Build: src/ → dist/
   Copies source files into dist/ for Tauri + Pages deployment.
   Run: node scripts/build.js
============================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const STATIC_ASSETS = [
    'highlight.min.js',
    'highlight-atom-one-dark.min.css',
    'highlight-atom-one-light.min.css',
    'manifest.json',
    'sw.js',
    'icon.svg',
    'favicon-32.png',
    'icon-192.png',
    'icon-512.png',
];

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function copyFile(src, dst) {
    fs.copyFileSync(src, dst);
    console.log(`  COPY ${path.relative(ROOT, src)} → ${path.relative(ROOT, dst)}`);
}

function copyDir(srcDir, dstDir) {
    ensureDir(dstDir);
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const e of entries) {
        const s = path.join(srcDir, e.name);
        const d = path.join(dstDir, e.name);
        if (e.isDirectory()) {
            copyDir(s, d);
        } else {
            copyFile(s, d);
        }
    }
}

console.log('Building dist/ from src/...\n');

// Clean dist/ (keep icons/, .well-known/)
ensureDir(DIST);
for (const entry of fs.readdirSync(DIST)) {
    if (entry === 'icons' || entry === '.well-known') continue;
    const p = path.join(DIST, entry);
    if (fs.lstatSync(p).isDirectory()) {
        fs.rmSync(p, { recursive: true });
    } else {
        fs.unlinkSync(p);
    }
}

// Write .nojekyll to prevent Jekyll processing on GitHub Pages
fs.writeFileSync(path.join(DIST, '.nojekyll'), '');
console.log('  WRITE .nojekyll');

// Copy src/index.html and fix asset paths for flat dist/ layout
let html = fs.readFileSync(path.join(SRC, 'index.html'), 'utf-8');
html = html.replace(/\.\.\//g, '');
fs.writeFileSync(path.join(DIST, 'index.html'), html);
console.log(`  HTML ${path.relative(ROOT, path.join(SRC, 'index.html'))} → ${path.relative(ROOT, path.join(DIST, 'index.html'))} (paths fixed)`);

// Copy src/styles/
copyDir(path.join(SRC, 'styles'), path.join(DIST, 'styles'));

// Copy src/scripts/
copyDir(path.join(SRC, 'scripts'), path.join(DIST, 'scripts'));

// Copy static assets from root to dist/
console.log('');
for (const asset of STATIC_ASSETS) {
    const src = path.join(ROOT, asset);
    if (fs.existsSync(src)) {
        copyFile(src, path.join(DIST, asset));
    }
}

// Copy icons/ directory
const iconsSrc = path.join(ROOT, 'icons');
const iconsDst = path.join(DIST, 'icons');
if (fs.existsSync(iconsSrc)) {
    copyDir(iconsSrc, iconsDst);
}

console.log('\nBuild complete. dist/ is ready for deployment.');
