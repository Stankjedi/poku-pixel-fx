// gallery/animated-webp.ts
var MAX_BYTES = 128 * 1024 * 1024;
function put24(out, at, value) {
  out[at] = value & 255;
  out[at + 1] = value >>> 8 & 255;
  out[at + 2] = value >>> 16 & 255;
}
function fourCC(bytes, at) {
  return String.fromCharCode(...bytes.subarray(at, at + 4));
}
function chunk(name, payload) {
  const out = new Uint8Array(8 + payload.length + (payload.length & 1));
  for (let i = 0; i < 4; i++) out[i] = name.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, payload.length, true);
  out.set(payload, 8);
  return out;
}
async function encodeFrame(canvas) {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob((blob) => blob && blob.type === "image/webp" ? resolve(blob) : reject(new Error("\uC774 \uBE0C\uB77C\uC6B0\uC800\uB294 WebP \uC778\uCF54\uB529\uC744 \uC9C0\uC6D0\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.")), "image/webp", 1);
    } catch {
      reject(new Error("WebP \uD504\uB808\uC784\uC744 \uC0DD\uC131\uD558\uC9C0 \uBABB\uD588\uC2B5\uB2C8\uB2E4."));
    }
  });
}
function imageChunks(input) {
  if (input.length < 20 || fourCC(input, 0) !== "RIFF" || fourCC(input, 8) !== "WEBP") throw new Error("\uC62C\uBC14\uB974\uC9C0 \uC54A\uC740 WebP \uD504\uB808\uC784\uC785\uB2C8\uB2E4.");
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength), end = 8 + view.getUint32(4, true);
  if (end !== input.length) throw new Error("WebP \uD504\uB808\uC784 \uD06C\uAE30\uAC00 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const parts = [];
  let alpha = false, image = false, offset = 12, total = 0;
  while (offset + 8 <= end) {
    const type = fourCC(input, offset), size = view.getUint32(offset + 4, true), next = offset + 8 + size + (size & 1);
    if (next > end) throw new Error("WebP \uD504\uB808\uC784\uC774 \uC190\uC0C1\uB418\uC5C8\uC2B5\uB2C8\uB2E4.");
    if (type === "ALPH" || type === "VP8 " || type === "VP8L") {
      if (type === "ALPH") alpha = true;
      if (type === "VP8L") {
        if (size < 5 || input[offset + 8] !== 47) throw new Error("WebP \uBB34\uC190\uC2E4 \uD504\uB808\uC784\uC774 \uC62C\uBC14\uB974\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
        alpha ||= !!(input[offset + 12] & 16);
      }
      if (type === "VP8 " || type === "VP8L") {
        if (image) throw new Error("\uC911\uBCF5\uB41C WebP \uC774\uBBF8\uC9C0\uC785\uB2C8\uB2E4.");
        image = true;
      }
      parts.push(input.subarray(offset, next));
      total += next - offset;
    }
    offset = next;
  }
  if (offset !== end || !image) throw new Error("WebP \uC774\uBBF8\uC9C0 \uB370\uC774\uD130\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const payload = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    payload.set(part, at);
    at += part.length;
  }
  return { payload, alpha };
}
async function encodeAnimatedWebP(options) {
  const { width, height, frameCount, fps, loop, drawFrame, onProgress } = options;
  if (![width, height, frameCount].every(Number.isInteger) || width < 1 || height < 1 || width > 16383 || height > 16383 || frameCount < 1 || frameCount > 3600 || !Number.isFinite(fps) || fps <= 0 || fps > 1e3) throw new Error("\uC560\uB2C8\uBA54\uC774\uC158 \uD06C\uAE30 \uB610\uB294 \uD504\uB808\uC784 \uC124\uC815\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("\uCE94\uBC84\uC2A4\uB97C \uB9CC\uB4E4 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.");
  const frames = [];
  let anyAlpha = false, totalBytes = 12 + 18 + 14;
  for (let i = 0; i < frameCount; i++) {
    ctx.clearRect(0, 0, width, height);
    await drawFrame(i, canvas, ctx);
    const blob = await encodeFrame(canvas), image = imageChunks(new Uint8Array(await blob.arrayBuffer()));
    anyAlpha ||= image.alpha;
    const duration = Math.round((i + 1) * 1e3 / fps) - Math.round(i * 1e3 / fps);
    if (duration < 1 || duration > 16777215) throw new Error("\uD504\uB808\uC784 \uC7AC\uC0DD \uC2DC\uAC04\uC774 \uC720\uD6A8\uD558\uC9C0 \uC54A\uC2B5\uB2C8\uB2E4.");
    const header = new Uint8Array(16);
    put24(header, 6, width - 1);
    put24(header, 9, height - 1);
    put24(header, 12, duration);
    header[15] = 2;
    const data = new Uint8Array(header.length + image.payload.length);
    data.set(header);
    data.set(image.payload, 16);
    const frame = chunk("ANMF", data);
    totalBytes += frame.length;
    if (totalBytes > MAX_BYTES) throw new Error("\uC560\uB2C8\uBA54\uC774\uC158 WebP\uAC00 \uB108\uBB34 \uD07D\uB2C8\uB2E4. PNG \uC2DC\uD2B8\uB97C \uC774\uC6A9\uD574 \uC8FC\uC138\uC694.");
    frames.push(frame);
    onProgress?.(i + 1, frameCount);
  }
  const vp8x = new Uint8Array(10);
  vp8x[0] = 2 | (anyAlpha ? 16 : 0);
  put24(vp8x, 4, width - 1);
  put24(vp8x, 7, height - 1);
  const anim = new Uint8Array(6);
  new DataView(anim.buffer).setUint16(4, loop ? 0 : 1, true);
  const riff = new Uint8Array(12);
  riff.set([82, 73, 70, 70], 0);
  new DataView(riff.buffer).setUint32(4, totalBytes - 8, true);
  riff.set([87, 69, 66, 80], 8);
  const output = new Uint8Array(totalBytes);
  let offset = 0;
  for (const part of [riff, chunk("VP8X", vp8x), chunk("ANIM", anim), ...frames]) {
    output.set(part, offset);
    offset += part.length;
  }
  return new Blob([output.buffer], { type: "image/webp" });
}
export {
  encodeAnimatedWebP
};
