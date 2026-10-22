/**
 * App icons for the scene editor (PWA): layered flats in front of a sun,
 * the 2.5D idea in one picture. Run: npx tsx scripts/make-editor-icons.ts
 */
import sharp from 'sharp';

const svg = (pad: number) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2b4a73"/><stop offset="1" stop-color="#141a24"/></linearGradient>
  </defs>
  <rect width="512" height="512" rx="${pad ? 0 : 112}" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${pad ? 0.78 : 1}) translate(-256 -256)">
    <circle cx="330" cy="170" r="58" fill="#ffd25a"/>
    <path d="M60 330 L170 210 L250 290 L330 200 L452 330 Z" fill="#5b8fc0" opacity="0.9"/>
    <path d="M60 370 L150 300 L240 350 L340 280 L452 370 Z" fill="#8fd0a8"/>
    <path d="M60 452 L60 400 Q256 340 452 400 L452 452 Z" fill="#f2efe8"/>
  </g>
</svg>`;

async function main() {
const out = 'public/icons';
await sharp(Buffer.from(svg(0))).resize(192, 192).png().toFile(`${out}/scene-editor-192.png`);
await sharp(Buffer.from(svg(0))).resize(512, 512).png().toFile(`${out}/scene-editor-512.png`);
await sharp(Buffer.from(svg(1))).resize(512, 512).png().toFile(`${out}/scene-editor-maskable-512.png`);
await sharp(Buffer.from(svg(1))).resize(180, 180).png().toFile(`${out}/scene-editor-apple-180.png`);
console.log('icons written to', out);
}
main();
