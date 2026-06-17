/**
 * generate-icons.mjs
 * Generates PWA icon PNGs (192x192, 512x512) from the source icon.
 * Run: node scripts/generate-icons.mjs
 * Requires: npm install --save-dev @napi-rs/canvas
 */
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const publicDir = join(projectRoot, 'public');

// Source: our generated icon
const sourcePath = 'C:/Users/User/.gemini/antigravity-ide/brain/b6f77007-d813-4009-a753-b79af8a6f08a/pwa_icon_source_1781699756993.png';

const sizes = [192, 512];

async function generateIcons() {
  const img = await loadImage(sourcePath);
  for (const size of sizes) {
    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, size, size);
    const buffer = canvas.toBuffer('image/png');
    const outPath = join(publicDir, `icon-${size}.png`);
    writeFileSync(outPath, buffer);
    console.log(`✅ Saved ${outPath} (${size}x${size})`);
  }
}

generateIcons().catch(console.error);
