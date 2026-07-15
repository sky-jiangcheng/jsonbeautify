const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const sizes = [
  { size: 16, filename: '16x16.png' },
  { size: 32, filename: '32x32.png' },
  { size: 64, filename: '64x64.png' },
  { size: 128, filename: '128x128.png' },
  { size: 256, filename: '256x256.png' },
  { size: 512, filename: '512x512.png' },
  { size: 256, filename: '128x128@2x.png' },
  { size: 192, filename: 'icon-192.png' },
  { size: 512, filename: 'icon-512.png' },
];

async function generateIcons() {
  const svgPath = path.join(__dirname, '../icon.svg');
  
  if (!fs.existsSync(svgPath)) {
    console.error('icon.svg not found');
    process.exit(1);
  }

  const tauriIconsDir = path.join(__dirname, '../src-tauri/icons');
  if (!fs.existsSync(tauriIconsDir)) {
    fs.mkdirSync(tauriIconsDir, { recursive: true });
  }

  for (const { size, filename } of sizes) {
    const isTauriIcon = !filename.startsWith('icon-');
    const outputDir = isTauriIcon ? tauriIconsDir : path.join(__dirname, '..');
    const outputPath = path.join(outputDir, filename);

    await sharp(svgPath)
      .resize(size, size)
      .png({ compressionLevel: 9 })
      .toFile(outputPath);

    console.log(`Generated ${outputPath} (${size}x${size})`);
  }

  console.log('\nAll icons generated successfully!');
}

generateIcons().catch(err => {
  console.error('Error generating icons:', err);
  process.exit(1);
});