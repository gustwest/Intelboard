const fs = require('fs');
const path = require('path');

const OLD_ACCENT_HEX = /#b14ef4/g;
const OLD_ACCENT_RGB = /177,78,244/g;
const OLD_ACCENT_RGB_NO_SPACE = /177,\s*78,\s*244/g;
const OLD_ACCENT_ALT = /#9500b3/g;
const OLD_BG = /#0f0e12/g;
const OLD_SURFACE = /#151218/g;
const OLD_SURFACE_ALT = /#16141c/g;

function replaceInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf8');
  
  content = content.replace(OLD_ACCENT_HEX, 'var(--brand-accent)');
  content = content.replace(OLD_ACCENT_RGB, '0,212,255');
  content = content.replace(OLD_ACCENT_RGB_NO_SPACE, '0,212,255');
  content = content.replace(OLD_ACCENT_ALT, 'var(--brand-accent-hover)');
  content = content.replace(OLD_BG, 'var(--brand-bg)');
  content = content.replace(OLD_SURFACE, 'var(--brand-surface)');
  content = content.replace(OLD_SURFACE_ALT, 'var(--brand-surface)');

  fs.writeFileSync(filePath, content);
  console.log('Updated ' + filePath);
}

function walkDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      walkDir(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      replaceInFile(fullPath);
    }
  }
}

walkDir('./frontend/src/app');
walkDir('./frontend/src/components');
