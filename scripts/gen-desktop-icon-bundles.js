const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const pngToIco = require('png-to-ico').default || require('png-to-ico');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'src-tauri/app-icon-source.png');         // rounded, for Windows .ico
const MACOS_SOURCE = path.join(ROOT, 'src-tauri/app-icon-source-macos.png'); // square full-bleed, for macOS .icns
const ICONS_DIR = path.join(ROOT, 'src-tauri/icons');

async function main() {
  // 1) Generate multi-resolution ICO for Windows (256/48/32/16)
  const icoBuf = await pngToIco(SOURCE);
  fs.writeFileSync(path.join(ICONS_DIR, 'icon.ico'), icoBuf);
  console.log('Generated icon.ico');

  // 2) Generate ICNS for macOS via iconutil
  const iconsetDir = path.join(ICONS_DIR, 'icon.iconset');
  if (fs.existsSync(iconsetDir)) {
    fs.rmSync(iconsetDir, { recursive: true });
  }
  fs.mkdirSync(iconsetDir, { recursive: true });

  const iconsetMap = [
    [16, '16x16'],
    [32, '16x16@2x'],
    [32, '32x32'],
    [64, '32x32@2x'],
    [128, '128x128'],
    [256, '128x128@2x'],
    [256, '256x256'],
    [512, '256x256@2x'],
    [512, '512x512'],
    [1024, '512x512@2x'],
  ];

  for (const [size, name] of iconsetMap) {
    await sharp(MACOS_SOURCE)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toFile(path.join(iconsetDir, `icon_${name}.png`));
  }

  execSync(`iconutil -c icns "${iconsetDir}" -o "${path.join(ICONS_DIR, 'icon.icns')}"`);
  console.log('Generated icon.icns');

  // Clean up iconset dir
  fs.rmSync(iconsetDir, { recursive: true });
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
