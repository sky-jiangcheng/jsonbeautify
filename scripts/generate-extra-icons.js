// 生成所有 generate-icons.js 未覆盖的图标
// 处理: favicon, docs/, src-tauri/icons/icon.png, Square*, StoreLogo, android/mipmap-*, iOS Xcode Assets
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SOURCE = path.join(ROOT, 'src-tauri/app-icon-source.png');

// 待生成的图标清单：[相对路径, 尺寸]
const targets = [
  // 1. 根目录 favicon
  ['favicon-32.png', 32],

  // 1b. 页面 header logo（左上角，22px 显示 @2x；与 favicon 同源保证标识一致）
  ['logo.png', 48],

  // 2. docs/ 下的 PWA 与 favicon
  ['docs/favicon-32.png', 32],
  ['docs/icon-192.png', 192],
  ['docs/icon-512.png', 512],

  // 3. src-tauri/icons/ 主图标与 Windows Store logos
  ['src-tauri/icons/icon.png', 512],
  ['src-tauri/icons/Square30x30Logo.png', 30],
  ['src-tauri/icons/Square44x44Logo.png', 44],
  ['src-tauri/icons/Square71x71Logo.png', 71],
  ['src-tauri/icons/Square89x89Logo.png', 89],
  ['src-tauri/icons/Square107x107Logo.png', 107],
  ['src-tauri/icons/Square142x142Logo.png', 142],
  ['src-tauri/icons/Square150x150Logo.png', 150],
  ['src-tauri/icons/Square284x284Logo.png', 284],
  ['src-tauri/icons/Square310x310Logo.png', 310],
  ['src-tauri/icons/StoreLogo.png', 50],

  // 4. Android mipmap-* (launcher + round + foreground)
  ['src-tauri/icons/android/mipmap-mdpi/ic_launcher.png', 48],
  ['src-tauri/icons/android/mipmap-mdpi/ic_launcher_round.png', 48],
  ['src-tauri/icons/android/mipmap-mdpi/ic_launcher_foreground.png', 108],
  ['src-tauri/icons/android/mipmap-hdpi/ic_launcher.png', 72],
  ['src-tauri/icons/android/mipmap-hdpi/ic_launcher_round.png', 72],
  ['src-tauri/icons/android/mipmap-hdpi/ic_launcher_foreground.png', 162],
  ['src-tauri/icons/android/mipmap-xhdpi/ic_launcher.png', 96],
  ['src-tauri/icons/android/mipmap-xhdpi/ic_launcher_round.png', 96],
  ['src-tauri/icons/android/mipmap-xhdpi/ic_launcher_foreground.png', 216],
  ['src-tauri/icons/android/mipmap-xxhdpi/ic_launcher.png', 144],
  ['src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_round.png', 144],
  ['src-tauri/icons/android/mipmap-xxhdpi/ic_launcher_foreground.png', 324],
  ['src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher.png', 192],
  ['src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_round.png', 192],
  ['src-tauri/icons/android/mipmap-xxxhdpi/ic_launcher_foreground.png', 432],
];

// iOS Xcode Assets 目录下文件名 → 尺寸映射（解析 AppIcon-{size}x{size}@{scale}x.png）
// 注: Capacitor 工程(ios/)已移除, 此逻辑保留注释供参考; Tauri iOS 图标由 generate-icons.js 生成到 src-tauri/icons/ios/

async function main() {
  if (!fs.existsSync(SOURCE)) {
    console.error('Source not found:', SOURCE);
    process.exit(1);
  }

  let count = 0;

  // 1) 处理清单内所有目标
  for (const [relPath, size] of targets) {
    const abs = path.join(ROOT, relPath);
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    await sharp(SOURCE)
      .resize(size, size, { kernel: sharp.kernel.lanczos3 })
      .png({ compressionLevel: 9 })
      .toFile(abs);
    console.log(`Generated ${relPath} (${size}x${size})`);
    count++;
  }

  // 2) 复制 icon.svg 到 docs/（HTML 引用 docs/icon.svg）
  const srcSvg = path.join(ROOT, 'icon.svg');
  const dstSvg = path.join(ROOT, 'docs/icon.svg');
  if (fs.existsSync(srcSvg)) {
    await fs.promises.copyFile(srcSvg, dstSvg);
    console.log('Copied docs/icon.svg');
    count++;
  }

  console.log(`\nExtra icons generated: ${count} total`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
