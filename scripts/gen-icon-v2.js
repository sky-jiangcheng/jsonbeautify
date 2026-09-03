const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const OUT_PNG = path.join(ROOT, 'src-tauri/app-icon-source.png');       // rounded, for PWA/Windows/favicon
const OUT_MACOS = path.join(ROOT, 'src-tauri/app-icon-source-macos.png'); // square full-bleed, for macOS .icns
const OUT_SVG = path.join(ROOT, 'icon.svg');
const OUT_JPG_SRC = path.join(ROOT, 'app-icon-new-source.jpg');

const SIZE = 1024;
const R = 220; // corner radius for squircle (rounded variant only)

// Elegant black palette
const BG_INNER = '#1c1c1e';
const BG_OUTER = '#0a0a0c';
const GOLD = '#f5d78e';
const GOLD_DARK = '#d4af37';
const HIGHLIGHT = '#ffffff';

// Logo fragment (identical for both variants)
const LOGO = `
  <!-- Bold braces { } -->
  <g filter="url(#logoShadow)" fill="url(#goldGrad)">
    <path d="M 310 330
             C 230 330, 230 430, 270 450
             C 310 470, 310 500, 270 520
             C 230 540, 230 640, 310 640
             L 330 640
             C 270 640, 270 560, 300 545
             C 330 530, 330 470, 300 455
             C 270 440, 270 350, 330 350
             Z" />
    <path d="M 714 330
             C 794 330, 794 430, 754 450
             C 714 470, 714 500, 754 520
             C 794 540, 794 640, 714 640
             L 694 640
             C 754 640, 754 560, 724 545
             C 694 530, 694 470, 724 455
             C 754 440, 754 350, 694 350
             Z" />
  </g>
  <!-- Center stylized J -->
  <g filter="url(#logoShadow)" fill="url(#goldGrad)">
    <path d="M 472 330 L 552 330 L 552 520
             C 552 585, 512 620, 462 620
             C 422 620, 392 595, 392 560
             C 392 540, 408 525, 428 525
             C 448 525, 462 540, 462 560
             C 462 575, 452 585, 437 585
             C 452 598, 482 595, 492 560
             L 492 360 L 472 360 Z" />
    <path d="M 560 280
             C 600 260, 640 280, 650 320
             C 620 300, 590 305, 572 320
             C 565 305, 562 290, 560 280 Z" />
  </g>`;

const DEFS = `
  <defs>
    <radialGradient id="bgGrad" cx="50%" cy="45%" r="75%" fx="50%" fy="40%">
      <stop offset="0%" stop-color="${BG_INNER}"/>
      <stop offset="70%" stop-color="#111113"/>
      <stop offset="100%" stop-color="${BG_OUTER}"/>
    </radialGradient>
    <linearGradient id="glossTop" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="${HIGHLIGHT}" stop-opacity="0.28"/>
      <stop offset="40%" stop-color="${HIGHLIGHT}" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="${HIGHLIGHT}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="shadowBottom" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="60%" stop-color="#000000" stop-opacity="0"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0.45"/>
    </linearGradient>
    <linearGradient id="edgeLight" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${HIGHLIGHT}" stop-opacity="0.18"/>
      <stop offset="50%" stop-color="${HIGHLIGHT}" stop-opacity="0.02"/>
      <stop offset="100%" stop-color="${HIGHLIGHT}" stop-opacity="0"/>
    </linearGradient>
    <linearGradient id="goldGrad" x1="0%" y1="0%" x2="0%" y2="100%">
      <stop offset="0%" stop-color="#fff2c8"/>
      <stop offset="40%" stop-color="${GOLD}"/>
      <stop offset="100%" stop-color="${GOLD_DARK}"/>
    </linearGradient>
    <filter id="logoShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="8"/>
      <feOffset dx="0" dy="10" result="offsetblur"/>
      <feComponentTransfer><feFuncA type="linear" slope="0.55"/></feComponentTransfer>
      <feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>`;

function buildSvg(rounded) {
  if (rounded) {
    const x = 60, sz = SIZE - 120;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  ${DEFS}
  <rect x="${x}" y="${x}" width="${sz}" height="${sz}" rx="${R}" ry="${R}" fill="url(#bgGrad)"/>
  <rect x="${x + 8}" y="${x + 8}" width="${sz - 16}" height="${sz - 16}" rx="${R - 8}" ry="${R - 8}" fill="none" stroke="url(#edgeLight)" stroke-width="6"/>
  <rect x="${x}" y="${x}" width="${sz}" height="${sz}" rx="${R}" ry="${R}" fill="url(#glossTop)"/>
  <rect x="${x}" y="${x}" width="${sz}" height="${sz}" rx="${R}" ry="${R}" fill="url(#shadowBottom)"/>
  <path d="M 180 220 Q 300 130 512 130 T 844 220" fill="none" stroke="${HIGHLIGHT}" stroke-width="18" stroke-linecap="round" opacity="0.16"/>
  <path d="M 200 260 Q 320 190 512 190 T 824 260" fill="none" stroke="${HIGHLIGHT}" stroke-width="8" stroke-linecap="round" opacity="0.08"/>
  ${LOGO}
</svg>`;
  }
  // Square full-bleed: macOS applies its own squircle mask -> never a hard square
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
  ${DEFS}
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#bgGrad)"/>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#glossTop)"/>
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" fill="url(#shadowBottom)"/>
  <path d="M 150 200 Q 300 120 512 120 T 874 200" fill="none" stroke="${HIGHLIGHT}" stroke-width="18" stroke-linecap="round" opacity="0.16"/>
  ${LOGO}
</svg>`;
}

async function main() {
  const roundedSvg = buildSvg(true);
  const squareSvg = buildSvg(false);

  // PWA/Windows/favicon: rounded with transparent corners
  fs.writeFileSync(OUT_SVG, roundedSvg);
  console.log('Wrote', OUT_SVG);
  await sharp(Buffer.from(roundedSvg)).png({ compressionLevel: 9 }).toFile(OUT_PNG);
  console.log('Wrote', OUT_PNG);
  await sharp(Buffer.from(roundedSvg)).resize(1920, 1920, { kernel: sharp.kernel.lanczos3 }).jpeg({ quality: 95 }).toFile(OUT_JPG_SRC);
  console.log('Wrote', OUT_JPG_SRC);

  // macOS: square full-bleed source
  await sharp(Buffer.from(squareSvg)).png({ compressionLevel: 9 }).toFile(OUT_MACOS);
  console.log('Wrote', OUT_MACOS);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
