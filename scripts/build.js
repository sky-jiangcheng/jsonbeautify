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
// 静态资源：从项目根目录复制
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
    'logo.png',
];

// 源文件：从 src/ 复制（拆分后的 CSS/JS）
const SRC_ASSETS = [
    'styles.css',
    'app.js',
    'head.js',   // 同步设置 data-device 的外部脚本（Tauri CSP 无 unsafe-inline 时也允许）
];

// 源子目录：从 src/app/ 复制到 dist/app/
const SRC_APP_DIR = 'app';

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

// Bundle src/app/{router,store,actions,render}.js + src/app.js into a single
// dist/app.js. This is the file dist/index.html actually loads, so edits to
// the per-file modules now ship. Without this step the published app ran a
// stale, hand-built monolith that ignored src/ changes.
const BUNDLE_ORDER = ['app/router.js', 'app/store.js', 'app/actions.js', 'app/render.js', 'app.js'];

function bundleApp() {
    const parts = BUNDLE_ORDER.map(function (rel) {
        const f = path.join(SRC, rel);
        if (!fs.existsSync(f)) throw new Error('Bundle source missing: ' + rel);
        return fs.readFileSync(f, 'utf-8');
    });
    // Each module is an IIFE; join with a separator so ASI edge cases are safe.
    const bundle = parts.join('\n;\n');
    fs.writeFileSync(path.join(DIST, 'app.js'), bundle);
    console.log('  BUNDLE ' + BUNDLE_ORDER.join(' + ') + ' → dist/app/../app.js (single file)');
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
// Replace the per-file module <script> tags with the single bundled app.js,
// so the only entry point is the freshly-built bundle above.
html = html.replace(/<script src="app\/router\.js"><\/script>\s*<script src="app\/store\.js"><\/script>\s*<script src="app\/actions\.js"><\/script>\s*<script src="app\/render\.js"><\/script>\s*<script src="app\.js"><\/script>/,
    '<script src="app.js"></script>');
fs.writeFileSync(path.join(DIST, 'index.html'), html);
console.log(`  HTML ${path.relative(ROOT, path.join(SRC, 'index.html'))} → ${path.relative(ROOT, path.join(DIST, 'index.html'))} (paths fixed, modules bundled)`);

// Copy static assets from root to dist/
console.log('');
for (const asset of STATIC_ASSETS) {
    const src = path.join(ROOT, asset);
    if (fs.existsSync(src)) {
        copyFile(src, path.join(DIST, asset));
    }
}

// Copy src/ assets (styles.css) to dist/ (app.js is produced by bundleApp)
console.log('');
for (const asset of SRC_ASSETS) {
    if (asset === 'app.js') continue; // produced by bundleApp()
    const src = path.join(SRC, asset);
    if (fs.existsSync(src)) {
        copyFile(src, path.join(DIST, asset));
    }
}

// Produce the single bundled entry point from src.
bundleApp();

console.log('\nBuild complete. dist/ is ready for deployment.');
