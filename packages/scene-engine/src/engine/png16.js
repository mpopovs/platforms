// Minimal PNG reader/writer for depth maps. Browsers decode PNGs to 8 bits per
// channel, which would destroy 16-bit depth, so we parse them ourselves with the
// built-in (De)CompressionStream ("deflate" = zlib, which is what PNG uses).

const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (bytes) => { let c = 0xffffffff; for (let i = 0; i < bytes.length; i++) c = CRC[(c ^ bytes[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }

// 16-bit greyscale PNG (values as given, e.g. millimetres)
export async function encodeGray16(w, h, data) {
  const raw = new Uint8Array(h * (1 + w * 2));
  for (let y = 0; y < h; y++) {
    const o = y * (1 + w * 2); raw[o] = 0; // filter: none
    for (let x = 0; x < w; x++) { const v = data[y * w + x]; raw[o + 1 + x * 2] = v >> 8; raw[o + 2 + x * 2] = v & 255; }
  }
  const idat = await pipe(raw, new CompressionStream('deflate'));
  const chunk = (type, body) => {
    const out = new Uint8Array(12 + body.length), dv = new DataView(out.buffer);
    dv.setUint32(0, body.length); out.set(new TextEncoder().encode(type), 4); out.set(body, 8);
    dv.setUint32(8 + body.length, crc32(out.subarray(4, 8 + body.length))); return out;
  };
  const ihdr = new Uint8Array(13), dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w); dv.setUint32(4, h); ihdr[8] = 16; ihdr[9] = 0; // 16-bit, greyscale
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', new Uint8Array())], { type: 'image/png' });
}

// returns { w, h, bitDepth, colorType, channels, get(x, y, c) } for 8/16-bit grey, grey+alpha, RGB, RGBA (no palette, no interlace)
export async function decodePNG(buf) {
  const b = new Uint8Array(buf), dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (b[0] !== 137 || b[1] !== 80) throw new Error('Not a PNG file');
  let p = 8, w, h, bitDepth, colorType, interlace; const idat = [];
  while (p < b.length) {
    const len = dv.getUint32(p), type = String.fromCharCode(...b.subarray(p + 4, p + 8)), body = b.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { const d = new DataView(body.buffer, body.byteOffset); w = d.getUint32(0); h = d.getUint32(4); bitDepth = body[8]; colorType = body[9]; interlace = body[12]; }
    else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    p += 12 + len;
  }
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels || interlace || (bitDepth !== 8 && bitDepth !== 16)) throw new Error('Unsupported PNG (use 8/16-bit greyscale or RGB, not interlaced)');
  const all = new Uint8Array(idat.reduce((n, c) => n + c.length, 0)); let o = 0; for (const c of idat) { all.set(c, o); o += c.length; }
  const raw = await pipe(all, new DecompressionStream('deflate'));
  const bpp = channels * bitDepth / 8, stride = w * bpp, out = new Uint8Array(h * stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], src = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1)), cur = out.subarray(y * stride, (y + 1) * stride), prev = y ? out.subarray((y - 1) * stride, y * stride) : null;
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, up = prev ? prev[i] : 0, c = prev && i >= bpp ? prev[i - bpp] : 0;
      let v = src[i];
      if (f === 1) v += a; else if (f === 2) v += up; else if (f === 3) v += (a + up) >> 1;
      else if (f === 4) { const pp = a + up - c, pa = Math.abs(pp - a), pb = Math.abs(pp - up), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? up : c; }
      cur[i] = v & 255;
    }
  }
  const get = bitDepth === 16
    ? (x, y, ch) => { const i = y * stride + (x * channels + ch) * 2; return (out[i] << 8) | out[i + 1]; }
    : (x, y, ch) => out[y * stride + x * channels + ch];
  return { w, h, bitDepth, colorType, channels, get };
}
