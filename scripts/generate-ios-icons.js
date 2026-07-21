const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

// This script renders the repo's icon.svg to a flattened PNG (no alpha) sized 1024x1024
// and writes it to src-tauri/app-icon-source.png so CI's `npx tauri icon` step will produce
// iOS/macOS icons without transparency.

(async function main(){
  try {
    const repoRoot = path.resolve(__dirname, '..');
    const svgPath = path.join(repoRoot, 'icon.svg');
    const outPath = path.join(repoRoot, 'src-tauri', 'app-icon-source.png');

    if (!fs.existsSync(svgPath)) {
      console.error('icon.svg not found at', svgPath);
      process.exit(1);
    }

    const svgBuffer = fs.readFileSync(svgPath);

    // Render SVG to 1024x1024 PNG with solid background to avoid any alpha
    await sharp(svgBuffer, { density: 300 })
      .resize(1024, 1024, { fit: 'contain', background: { r: 13, g: 17, b: 23, alpha: 1 } })
      .flatten({ background: '#0d1117' })
      .png({ quality: 100 })
      .toFile(outPath);

    console.log('Wrote', outPath);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
