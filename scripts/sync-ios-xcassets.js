const fs = require('fs');
const path = require('path');

const SOURCE_DIR = path.join(__dirname, '../src-tauri/icons/ios');
const TARGET_DIR = path.join(__dirname, '../ios/App/App/Assets.xcassets/AppIcon.appiconset');
const CONTENTS_JSON = path.join(TARGET_DIR, 'Contents.json');

/**
 * 解析源文件名 → 实际像素尺寸（单边）
 *   AppIcon-20x20@2x.png   → 40
 *   AppIcon-83.5x83.5@2x.png → 167
 *   AppIcon-1024.png       → 1024
 *   AppIcon-512@2x.png     → 1024
 */
function parseSourcePixels(filename) {
  // 去掉前缀和后缀
  const base = filename.replace(/^AppIcon-/, '').replace(/\.png$/, '');

  // 情形 1: AppIcon-1024.png / AppIcon-512@2x.png
  let m = base.match(/^(\d+(?:\.\d+)?)(@(\d)x)?$/);
  if (m) {
    const size = parseFloat(m[1]);
    const scale = m[3] ? parseInt(m[3], 10) : 1;
    return Math.round(size * scale);
  }

  // 情形 2: AppIcon-20x20@2x.png / AppIcon-83.5x83.5@2x.png
  m = base.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(@(\d)x)?$/);
  if (m) {
    const size = parseFloat(m[1]);
    const scale = m[4] ? parseInt(m[4], 10) : 1;
    return Math.round(size * scale);
  }

  return null;
}

/**
 * 解析 Contents.json 里一条记录 → 实际需要的像素尺寸（单边）
 */
function parseEntryPixels(entry) {
  const sizeStr = entry.size || ''; // e.g. "20x20", "83.5x83.5", "1024x1024"
  const scaleStr = entry.scale || '1x'; // e.g. "1x", "2x", "3x"
  const sizeMatch = sizeStr.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!sizeMatch) return null;
  const size = parseFloat(sizeMatch[1]);
  const scale = parseInt(scaleStr.replace('x', ''), 10);
  return Math.round(size * scale);
}

function main() {
  // ---------- 检查输入 ----------
  if (!fs.existsSync(SOURCE_DIR)) {
    console.error(`❌ 源目录不存在: ${SOURCE_DIR}`);
    console.error('   请先运行: node scripts/generate-icons.js');
    process.exit(1);
  }
  if (!fs.existsSync(CONTENTS_JSON)) {
    console.error(`❌ Contents.json 不存在: ${CONTENTS_JSON}`);
    process.exit(1);
  }

  // ---------- 扫描源文件，建 "像素 → 文件路径数组" 映射 ----------
  const sourceFiles = fs.readdirSync(SOURCE_DIR).filter(f => f.endsWith('.png'));
  const pixelsToSources = new Map(); // pixels -> [absPath, absPath, ...]
  for (const f of sourceFiles) {
    const px = parseSourcePixels(f);
    if (px === null) {
      console.warn(`⚠️  跳过无法解析的源文件: ${f}`);
      continue;
    }
    if (!pixelsToSources.has(px)) pixelsToSources.set(px, []);
    pixelsToSources.get(px).push(path.join(SOURCE_DIR, f));
  }
  console.log(`📦 源图标目录扫描完成: ${sourceFiles.length} 个文件，${pixelsToSources.size} 种像素`);

  // ---------- 读取 Contents.json ----------
  const contents = JSON.parse(fs.readFileSync(CONTENTS_JSON, 'utf8'));
  const entries = contents.images || [];

  // 去重：同一个目标 filename 可能对应多个 entry（iPad/iPhone 共用），取像素最高的
  const targetMap = new Map(); // filename -> { pixels, entry }
  for (const entry of entries) {
    const filename = entry.filename;
    if (!filename) continue;
    const px = parseEntryPixels(entry);
    if (px === null) continue;
    const existing = targetMap.get(filename);
    if (!existing || px > existing.pixels) {
      targetMap.set(filename, { pixels: px, entry });
    }
  }
  console.log(`📋 Contents.json 声明目标: ${targetMap.size} 个独立文件`);

  // ---------- 逐个复制 ----------
  let copied = 0;
  let skipped = 0;
  const usedFilenames = new Set(['Contents.json']);

  for (const [filename, { pixels, entry }] of targetMap.entries()) {
    usedFilenames.add(filename);

    const candidates = pixelsToSources.get(pixels);
    if (!candidates || candidates.length === 0) {
      // 找最接近的像素（向下兼容）
      const allPixels = [...pixelsToSources.keys()].sort((a, b) => b - a);
      const fallback = allPixels.find(p => p >= pixels) || allPixels[0];
      if (!fallback) {
        console.error(`❌ [${filename}] 需要 ${pixels}px，但源目录里完全找不到匹配`);
        skipped++;
        continue;
      }
      console.warn(`⚠️  [${filename}] 需要 ${pixels}px，无精准匹配，兜底用 ${fallback}px`);
      candidates.push(...pixelsToSources.get(fallback));
    }

    const srcPath = candidates[0]; // 任取第一个，同像素内容一致
    const dstPath = path.join(TARGET_DIR, filename);

    // 对比字节避免重复写入
    const srcBuf = fs.readFileSync(srcPath);
    if (fs.existsSync(dstPath)) {
      const dstBuf = fs.readFileSync(dstPath);
      if (Buffer.compare(srcBuf, dstBuf) === 0) {
        console.log(`⏭  [${filename}] ${pixels}px — 已最新，跳过`);
        skipped++;
        continue;
      }
    }

    fs.copyFileSync(srcPath, dstPath);
    console.log(`✅ [${filename}] ${pixels}px ← ${path.basename(srcPath)}`);
    copied++;
  }

  // ---------- 清理目标目录里冗余的 png（不在 Contents.json 引用列表里的） ----------
  const existing = fs.readdirSync(TARGET_DIR);
  let removed = 0;
  for (const f of existing) {
    if (!f.endsWith('.png')) continue;
    if (usedFilenames.has(f)) continue;
    const fullPath = path.join(TARGET_DIR, f);
    fs.unlinkSync(fullPath);
    console.log(`🧹 删除冗余: ${f}`);
    removed++;
  }

  // ---------- 总结 ----------
  console.log('');
  console.log('═══════════════════════════════════════════');
  console.log(`✅ 同步完成`);
  console.log(`   复制/覆盖:  ${copied}`);
  console.log(`   跳过(已最新): ${skipped}`);
  console.log(`   清理冗余:   ${removed}`);
  console.log(`═══════════════════════════════════════════`);
}

main();
