// gallery/png.ts
var encoder = new TextEncoder();
var table = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 3988292384 ^ c >>> 1 : c >>> 1;
  table[n] = c >>> 0;
}
function chunk(name, data) {
  const out = new Uint8Array(data.length + 12), view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(encoder.encode(name), 4);
  out.set(data, 8);
  let crc = 4294967295;
  for (let i = 4; i < out.length - 4; i++) crc = table[(crc ^ out[i]) & 255] ^ crc >>> 8;
  view.setUint32(out.length - 4, (crc ^ 4294967295) >>> 0);
  return out;
}
async function encodeRGBAPNG(w, h, rgba) {
  if (!Number.isSafeInteger(w) || !Number.isSafeInteger(h) || w < 1 || h < 1 || rgba.length !== w * h * 4) throw new RangeError("Invalid PNG dimensions or buffer");
  const stride = w * 4, raw = new Uint8Array((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    const start = y * (stride + 1), row = y * stride;
    raw[start] = 1;
    for (let x = 0; x < stride; x++) raw[start + 1 + x] = rgba[row + x] - (x >= 4 ? rgba[row + x - 4] : 0) & 255;
  }
  const compressed = new Uint8Array(await new Response(new Blob([raw.buffer]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, w);
  view.setUint32(4, h);
  header[8] = 8;
  header[9] = 6;
  return new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", header), chunk("IDAT", compressed), chunk("IEND", new Uint8Array())].map((a) => a.buffer), { type: "image/png" });
}
function copyAtlasFrame(atlas, atlasW, frame, w, h, x, y, sx = 0, sy = 0) {
  for (let row = 0; row < h; row++) {
    const targetY = row + sy;
    if (targetY < 0 || targetY >= h) continue;
    const left = Math.max(0, -sx), right = Math.min(w, w - sx);
    if (right > left) atlas.set(frame.subarray((row * w + left) * 4, (row * w + right) * 4), ((y + targetY) * atlasW + x + left + sx) * 4);
  }
}

export {
  encodeRGBAPNG,
  copyAtlasFrame
};
