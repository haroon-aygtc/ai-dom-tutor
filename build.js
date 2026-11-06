/**
 * build.js — Post-compile packaging script
 *
 * Run after `tsc`. This script:
 *  1. Copies non-TS assets from src/ into dist/ (manifest, HTML, CSS, icons)
 *  2. Does NOT rename .ts files — tsc already compiled them to .js in dist/
 *  3. Removes any leftover .ts files from dist/ (shouldn't exist, but safety net)
 *  4. Generates placeholder icon PNGs if none exist in src/assets/
 */

const fs   = require('fs');
const path = require('path');

const SRC  = 'src';
const DIST = 'dist';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Copy a single file, creating destination directories as needed. */
function copyFile(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

/** Recursively copy files matching a filter from src → dest. */
function copyAssets(srcDir, destDir, filter) {
  if (!fs.existsSync(srcDir)) return;
  fs.readdirSync(srcDir).forEach(name => {
    const srcPath  = path.join(srcDir, name);
    const destPath = path.join(destDir, name);
    const stat = fs.statSync(srcPath);
    if (stat.isDirectory()) {
      copyAssets(srcPath, destPath, filter);
    } else if (filter(name)) {
      copyFile(srcPath, destPath);
    }
  });
}

/** Remove leftover .ts source files from dist/ (safety net). */
function removeTypeScriptSources(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(name => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) {
      removeTypeScriptSources(p);
    } else if (name.endsWith('.ts')) {
      fs.unlinkSync(p);
      console.log(`  removed leftover TS source: ${p}`);
    }
  });
}

/**
 * Generate a minimal 1×1 solid-color PNG as a Buffer.
 * This is used to create placeholder icons when no real icon images exist.
 *
 * Format: PNG signature + IHDR + IDAT + IEND (minimal valid PNG).
 * Real icons should replace these in src/assets/.
 */
function generatePlaceholderPng(size) {
  // We use a known-good minimal PNG (1×1 purple pixel) scaled via IHDR dimensions.
  // For simplicity we produce a proper minimal PNG with the correct dimensions.
  // PNG structure: signature | IHDR chunk | IDAT chunk | IEND chunk

  const crc32 = (() => {
    const table = new Uint32Array(256);
    for (let i = 0; i < 256; i++) {
      let c = i;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      table[i] = c;
    }
    return (buf) => {
      let crc = 0xFFFFFFFF;
      for (const b of buf) crc = table[(crc ^ b) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    };
  })();

  function chunk(type, data) {
    const typeBytes = Buffer.from(type, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const crcInput = Buffer.concat([typeBytes, data]);
    const crcVal = Buffer.alloc(4);
    crcVal.writeUInt32BE(crc32(crcInput), 0);
    return Buffer.concat([len, typeBytes, data, crcVal]);
  }

  // PNG signature
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR: width, height, bitDepth=8, colorType=2 (RGB), compression=0, filter=0, interlace=0
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8]  = 8; // bit depth
  ihdr[9]  = 2; // RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  // IDAT: one scanline per row, filter byte 0 + RGB per pixel
  // Color: #667eea (purple-blue)
  const R = 0x66, G = 0x7e, B = 0xea;
  const scanline = Buffer.alloc(1 + size * 3);
  scanline[0] = 0; // filter type None
  for (let x = 0; x < size; x++) {
    scanline[1 + x * 3]     = R;
    scanline[1 + x * 3 + 1] = G;
    scanline[1 + x * 3 + 2] = B;
  }
  const raw = Buffer.concat(Array.from({ length: size }, () => scanline));

  // zlib deflate — use Node's built-in zlib
  const zlib = require('zlib');
  const compressed = zlib.deflateSync(raw);

  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Main Build ───────────────────────────────────────────────────────────────

function build() {
  console.log('📦 Packaging extension...\n');

  ensureDir(DIST);

  // 1. Copy manifest.json (already uses .js paths — no patching needed)
  console.log('  Copying manifest.json');
  copyFile(path.join(SRC, 'manifest.json'), path.join(DIST, 'manifest.json'));

  // 2. Copy HTML files (popup)
  console.log('  Copying HTML files');
  copyAssets(SRC, DIST, name => name.endsWith('.html'));

  // 3. Copy CSS files (content script styles)
  console.log('  Copying CSS files');
  copyAssets(SRC, DIST, name => name.endsWith('.css'));

  // 4. Copy / generate icon assets
  const assetsDestDir = path.join(DIST, 'assets');
  ensureDir(assetsDestDir);
  const assetsSrcDir = path.join(SRC, 'assets');

  const iconSizes = [16, 48, 128];
  iconSizes.forEach(size => {
    const iconName = `icon${size}.png`;
    const srcIcon  = path.join(assetsSrcDir, iconName);
    const destIcon = path.join(assetsDestDir, iconName);

    if (fs.existsSync(srcIcon)) {
      fs.copyFileSync(srcIcon, destIcon);
      console.log(`  Copied ${iconName}`);
    } else {
      // Generate a placeholder icon so the extension loads without missing-icon errors
      fs.writeFileSync(destIcon, generatePlaceholderPng(size));
      console.log(`  Generated placeholder ${iconName} (${size}×${size})`);
    }
  });

  // 5. Remove any stray .ts source files from dist/ (tsc should not emit them,
  //    but guard against accidental copies)
  console.log('  Cleaning leftover .ts files from dist/');
  removeTypeScriptSources(DIST);

  console.log('\n✅ Build complete!');
  console.log('\nTo load in Chrome:');
  console.log('  1. Open chrome://extensions/');
  console.log('  2. Enable "Developer mode"');
  console.log('  3. Click "Load unpacked" → select the dist/ folder\n');
}

build();
