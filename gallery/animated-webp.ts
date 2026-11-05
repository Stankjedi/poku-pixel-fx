import { frameDurationMs } from "../src/render/export.js";

// Browser-only animated WebP muxer. Each independently encoded frame replaces the full canvas.
type DrawFrame = (index: number, canvas: HTMLCanvasElement, ctx: CanvasRenderingContext2D) => void | Promise<void>;
export interface AnimatedWebPOptions {
  width: number; height: number; frameCount: number; fps: number; loop: boolean;
  drawFrame: DrawFrame; onProgress?: (done: number, total: number) => void;
}
const MAX_BYTES = 128 * 1024 * 1024;
function put24(out: Uint8Array, at: number, value: number) {
  out[at] = value & 255; out[at + 1] = (value >>> 8) & 255; out[at + 2] = (value >>> 16) & 255;
}
function fourCC(bytes: Uint8Array, at: number) { return String.fromCharCode(...bytes.subarray(at, at + 4)); }
function chunk(name: string, payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(8 + payload.length + (payload.length & 1));
  for (let i = 0; i < 4; i++) out[i] = name.charCodeAt(i);
  new DataView(out.buffer).setUint32(4, payload.length, true); out.set(payload, 8); return out;
}
async function encodeFrame(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    try {
      canvas.toBlob(blob => blob && blob.type === 'image/webp' ? resolve(blob) : reject(new Error('이 브라우저는 WebP 인코딩을 지원하지 않습니다.')), 'image/webp', 1);
    } catch { reject(new Error('WebP 프레임을 생성하지 못했습니다.')); }
  });
}
function imageChunks(input: Uint8Array): { payload: Uint8Array; alpha: boolean } {
  if (input.length < 20 || fourCC(input, 0) !== 'RIFF' || fourCC(input, 8) !== 'WEBP') throw new Error('올바르지 않은 WebP 프레임입니다.');
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength), end = 8 + view.getUint32(4, true);
  if (end !== input.length) throw new Error('WebP 프레임 크기가 올바르지 않습니다.');
  const parts: Uint8Array[] = []; let alpha = false, image = false, offset = 12, total = 0;
  while (offset + 8 <= end) {
    const type = fourCC(input, offset), size = view.getUint32(offset + 4, true), next = offset + 8 + size + (size & 1);
    if (next > end) throw new Error('WebP 프레임이 손상되었습니다.');
    if (type === 'ALPH' || type === 'VP8 ' || type === 'VP8L') {
      if (type === 'ALPH') alpha = true;
      if (type === 'VP8L') {
        if (size < 5 || input[offset + 8] !== 0x2f) throw new Error('WebP 무손실 프레임이 올바르지 않습니다.');
        alpha ||= !!(input[offset + 12] & 0x10);
      }
      if (type === 'VP8 ' || type === 'VP8L') { if (image) throw new Error('중복된 WebP 이미지입니다.'); image = true; }
      parts.push(input.subarray(offset, next)); total += next - offset;
    }
    offset = next;
  }
  if (offset !== end || !image) throw new Error('WebP 이미지 데이터가 없습니다.');
  const payload = new Uint8Array(total); let at = 0; for (const part of parts) { payload.set(part, at); at += part.length; }
  return {payload, alpha};
}
export async function encodeAnimatedWebP(options: AnimatedWebPOptions): Promise<Blob> {
  const {width, height, frameCount, fps, loop, drawFrame, onProgress} = options;
  if (![width,height,frameCount].every(Number.isInteger) || width < 1 || height < 1 || width > 16383 || height > 16383 || frameCount < 1 || frameCount > 3600 || !Number.isFinite(fps) || fps <= 0 || fps > 1000) throw new Error('애니메이션 크기 또는 프레임 설정이 유효하지 않습니다.');
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('캔버스를 만들 수 없습니다.');
  const frames: Uint8Array[] = []; let anyAlpha = false, totalBytes = 12 + 18 + 14;
  for (let i = 0; i < frameCount; i++) {
    ctx.clearRect(0, 0, width, height);
    await drawFrame(i, canvas, ctx);
    const blob = await encodeFrame(canvas), image = imageChunks(new Uint8Array(await blob.arrayBuffer()));
    anyAlpha ||= image.alpha;
    const duration = frameDurationMs(i, fps);
    if (duration < 1 || duration > 0xffffff) throw new Error('프레임 재생 시간이 유효하지 않습니다.');
    const header = new Uint8Array(16); put24(header, 6, width - 1); put24(header, 9, height - 1); put24(header, 12, duration); header[15] = 2;
    const data = new Uint8Array(header.length + image.payload.length); data.set(header); data.set(image.payload, 16);
    const frame = chunk('ANMF', data); totalBytes += frame.length;
    if (totalBytes > MAX_BYTES) throw new Error('애니메이션 WebP가 너무 큽니다. PNG 시트를 이용해 주세요.');
    frames.push(frame); onProgress?.(i + 1, frameCount);
  }
  const vp8x = new Uint8Array(10); vp8x[0] = 0x02 | (anyAlpha ? 0x10 : 0); put24(vp8x, 4, width - 1); put24(vp8x, 7, height - 1);
  const anim = new Uint8Array(6); new DataView(anim.buffer).setUint16(4, loop ? 0 : 1, true);
  const riff = new Uint8Array(12); riff.set([82,73,70,70],0); new DataView(riff.buffer).setUint32(4, totalBytes - 8, true); riff.set([87,69,66,80],8);
  const output = new Uint8Array(totalBytes); let offset = 0;
  for (const part of [riff, chunk('VP8X',vp8x), chunk('ANIM',anim), ...frames]) { output.set(part, offset); offset += part.length; }
  return new Blob([output.buffer], {type:'image/webp'});
}
