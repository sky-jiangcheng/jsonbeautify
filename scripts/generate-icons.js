const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  // Desktop / Tauri icons
  { size: 16, filename: '16x16.png' },
  { size: 32, filename: '32x32.png' },
  { size: 64, filename: '64x64.png' },
  { size: 128, filename: '128x128.png' },
  { size: 256, filename: '256x256.png' },
  { size: 512, filename: '512x512.png' },
  { size: 256, filename: '128x128@2x.png' },

  // PWA icons
  { size: 192, filename: 'icon-192.png' },
  { size: 512, filename: 'icon-512.png' },

  // iOS App Store icons
  { size: 20, filename: 'ios/AppIcon-20x20@1x.png' },
  { size: 40, filename: 'ios/AppIcon-20x20@2x.png' },
  { size: 60, filename: 'ios/AppIcon-20x20@3x.png' },
  { size: 29, filename: 'ios/AppIcon-29x29@1x.png' },
  { size: 58, filename: 'ios/AppIcon-29x29@2x.png' },
  { size: 87, filename: 'ios/AppIcon-29x29@3x.png' },
  { size: 40, filename: 'ios/AppIcon-40x40@1x.png' },
  { size: 80, filename: 'ios/AppIcon-40x40@2x.png' },
  { size: 120, filename: 'ios/AppIcon-40x40@3x.png' },
  { size: 120, filename: 'ios/AppIcon-60x60@2x.png' },
  { size: 180, filename: 'ios/AppIcon-60x60@3x.png' },
  { size: 76, filename: 'ios/AppIcon-76x76@1x.png' },
  { size: 152, filename: 'ios/AppIcon-76x76@2x.png' },
  { size: 167, filename: 'ios/AppIcon-83.5x83.5@2x.png' },
  { size: 1024, filename: 'ios/AppIcon-1024.png' },
];

async function generateIcons() {
  const svgPath = path.join(__dirname, '../icon.svg');

  if (!fs.existsSync(svgPath)) {
    console.error('icon.svg not found');
    process.exit(1);
  }

  const tauriIconsDir = path.join(__dirname, '../src-tauri/icons');
  const iosIconsDir = path.join(tauriIconsDir, 'ios');

  for (const dir of [tauriIconsDir, iosIconsDir]) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  for (const { size, filename } of sizes) {
    const isPwaIcon = filename.startsWith('icon-');
    const isIosIcon = filename.startsWith('ios/');

    let outputPath;
    if (isPwaIcon) {
      outputPath = path.join(__dirname, '..', filename);
    } else if (isIosIcon) {
      outputPath = path.join(tauriIconsDir, filename);
    } else {
      outputPath = path.join(tauriIconsDir, filename);
    }

    await sharp(svgPath)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`Generated ${outputPath} (${size}x${size})`);
  }

  console.log(`\nAll icons generated successfully! (${sizes.length} total)`);
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});
