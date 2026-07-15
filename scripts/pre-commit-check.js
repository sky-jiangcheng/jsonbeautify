const fs = require('fs');
const path = require('path');

const cdnPatterns = [
  /https?:\/\/cdnjs\.cloudflare\.com/i,
  /https?:\/\/cdn\.jsdelivr\.net/i,
  /https?:\/\/unpkg\.com/i,
  /https?:\/\/raw\.githubusercontent\.com/i,
];

const filesToCheck = [
  'index.html',
  'dist/index.html',
];

function checkCDN() {
  let hasCDN = false;
  const foundCDN = [];

  for (const filePath of filesToCheck) {
    const fullPath = path.join(__dirname, '..', filePath);
    if (!fs.existsSync(fullPath)) continue;

    const content = fs.readFileSync(fullPath, 'utf-8');
    
    for (const pattern of cdnPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        hasCDN = true;
        foundCDN.push(`${filePath}: ${matches.join(', ')}`);
      }
    }
  }

  if (hasCDN) {
    console.error('\x1b[31m', '❌ ERROR: CDN references found in HTML files!');
    console.error('\x1b[31m', 'This will cause App Store sandbox rejection.');
    console.error('\x1b[31m', 'Found:');
    foundCDN.forEach(f => console.error('\x1b[31m', `  - ${f}`));
    console.error('\x1b[33m', '\n💡 Fix: Replace CDN URLs with local file paths');
    console.error('\x1b[33m', 'Example: "styles/atom-one-dark.min.css" instead of CDN URL');
    console.error('\x1b[0m');
    process.exit(1);
  } else {
    console.log('\x1b[32m', '✅ No CDN references found');
    console.error('\x1b[0m');
  }
}

checkCDN();