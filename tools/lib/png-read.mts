// Strict, bounded PNG decoding for asset import. Samples stay in their encoded
// color space: this importer does not perform ICC, gamma, or other profile transforms.
import { inflateSync } from "node:zlib";

const MAX_PIXELS = 16_777_216;
const MAX_DIMENSION = 65_535;
const MAX_FILE_BYTES = 128 * 1024 * 1024;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const byte of bytes) c = CRC[(c ^ byte) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

export interface DecodedPNG {
  width: number;
  height: number;
  /** Straight (not premultiplied) RGBA samples, without color-profile conversion. */
  rgba: Uint8Array;
  warnings?: string[];
}

/** Decode noninterlaced 8-bit PNGs and indexed 1/2/4/8-bit PNGs, including tRNS. */
export function decodePNG(png: Uint8Array): DecodedPNG {
  if (!(png instanceof Uint8Array) || png.length < 8 || SIGNATURE.some((v, i) => png[i] !== v)) {
    throw new Error("Invalid PNG signature.");
  }
  if (png.length > MAX_FILE_BYTES) throw new Error("PNG exceeds the 128 MiB encoded file limit.");
  const bytes = Buffer.from(png.buffer, png.byteOffset, png.byteLength);
  let width = 0, height = 0, depth = 0, color = -1, channels = 0;
  let seenHeader = false, seenData = false, dataEnded = false, seenEnd = false, chunkCount = 0;
  let palette: Buffer | undefined, transparency: Buffer | undefined;
  const blocks: Buffer[] = [], profiles = new Set<string>();
  for (let offset = 8; offset < bytes.length;) {
    if (++chunkCount > 65_536) throw new Error("PNG exceeds the 65,536 chunk import limit.");
    if (bytes.length - offset < 12) throw new Error("Truncated PNG chunk header or CRC.");
    const length = bytes.readUInt32BE(offset);
    if (length > 0x7fffffff || length > bytes.length - offset - 12) throw new Error("PNG chunk length exceeds file bounds.");
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const typeBytes = bytes.subarray(offset + 4, offset + 8);
    if (typeBytes.some(v => !((v >= 65 && v <= 90) || (v >= 97 && v <= 122))) || (typeBytes[2] & 32)) {
      throw new Error("Invalid PNG chunk type.");
    }
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) {
      throw new Error(`PNG CRC mismatch in ${type}.`);
    }
    if (!seenHeader && type !== "IHDR") throw new Error("PNG IHDR must be the first chunk.");
    if (seenData && type !== "IDAT") dataEnded = true;
    if (["acTL", "fcTL", "fdAT"].includes(type)) throw new Error("Animated PNG (APNG) is not supported; export a PNG sprite sheet instead.");
    switch (type) {
      case "IHDR": {
        if (seenHeader || length !== 13) throw new Error("PNG requires exactly one 13-byte IHDR.");
        seenHeader = true;
        width = data.readUInt32BE(0); height = data.readUInt32BE(4); depth = data[8]; color = data[9];
        if (!width || !height || width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
          throw new Error("PNG dimensions exceed import bounds (65,535 per axis; 16,777,216 pixels total).");
        }
        if (depth === 16) throw new Error("16-bit PNG is not supported; export an 8-bit PNG.");
        if (data[12] !== 0) throw new Error("Interlaced PNG is not supported; export a noninterlaced PNG.");
        if (data[10] !== 0 || data[11] !== 0) throw new Error("Unsupported PNG compression or filter method.");
        if (color === 3 ? ![1, 2, 4, 8].includes(depth) : depth !== 8 || ![0, 2, 4, 6].includes(color)) {
          throw new Error(`Unsupported PNG color type ${color} / bit depth ${depth}; use RGBA8, RGB8, grayscale8, gray-alpha8, or indexed 1/2/4/8.`);
        }
        channels = color === 0 || color === 3 ? 1 : color === 2 ? 3 : color === 4 ? 2 : 4;
        break;
      }
      case "PLTE":
        if (palette || seenData || transparency || color === 0 || color === 4 || !length || length % 3 || length > 768 || (color === 3 && length / 3 > 2 ** depth)) {
          throw new Error("Invalid PNG palette size, color type, or chunk order.");
        }
        palette = data;
        break;
      case "tRNS":
        if (transparency || seenData) throw new Error("Duplicate or misplaced PNG tRNS chunk.");
        if (color === 3 ? !palette || !length || length > palette.length / 3 : color === 0 ? length !== 2 : color === 2 ? length !== 6 : true) {
          throw new Error("Invalid PNG tRNS transparency for its color type.");
        }
        if (color === 0 || color === 2) {
          for (let i = 0; i < length; i += 2) if (data.readUInt16BE(i) > 255) throw new Error("PNG tRNS sample exceeds 8-bit range.");
        }
        transparency = data;
        break;
      case "IDAT":
        if (dataEnded) throw new Error("PNG IDAT chunks must be consecutive.");
        if (color === 3 && !palette) throw new Error("Indexed PNG is missing its PLTE palette.");
        seenData = true;
        blocks.push(data);
        break;
      case "IEND":
        if (length !== 0 || !seenData) throw new Error("Invalid PNG IEND or missing image data.");
        if (offset + 12 !== bytes.length) throw new Error("Unexpected bytes after PNG IEND.");
        seenEnd = true;
        break;
      default:
        if (!(typeBytes[0] & 32)) throw new Error(`Unsupported critical PNG chunk ${type}.`);
        if (["iCCP", "sRGB", "gAMA", "cHRM", "cICP", "mDCV", "cLLI"].includes(type)) profiles.add(type);
    }
    offset += length + 12;
  }
  if (!seenEnd) throw new Error("PNG is missing IEND.");
  const rowBytes = Math.ceil(width * channels * depth / 8), bytesPerPixel = Math.max(1, Math.ceil(channels * depth / 8));
  const expectedBytes = (rowBytes + 1) * height, compressed = Buffer.concat(blocks);
  let raw: Buffer;
  try {
    // The bound is enforced by zlib while inflating, not after a potentially huge allocation.
    // Node supports info:true since v5, but @types/node's sync overload still says Buffer.
    const inflated = inflateSync(compressed, { maxOutputLength: expectedBytes, info: true }) as unknown as { buffer: Buffer; engine: { bytesWritten: number } };
    raw = inflated.buffer;
    if (inflated.engine.bytesWritten !== compressed.length) throw new Error("unused compressed data");
  } catch {
    throw new Error("Invalid PNG compressed data or inflated data exceeds expected image size.");
  }
  if (raw.length !== expectedBytes) throw new Error("PNG inflated data length does not match its dimensions.");
  const rgba = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    const start = y * (rowBytes + 1) + 1, filter = raw[start - 1], previous = start - rowBytes - 1;
    if (filter > 4) throw new Error(`Unsupported PNG row filter ${filter}.`);
    for (let x = 0; x < rowBytes; x++) {
      const left = x >= bytesPerPixel ? raw[start + x - bytesPerPixel] : 0;
      const up = y ? raw[previous + x] : 0, upperLeft = y && x >= bytesPerPixel ? raw[previous + x - bytesPerPixel] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
      raw[start + x] = (raw[start + x] + predictor) & 255;
    }
    for (let x = 0; x < width; x++) {
      const output = (y * width + x) * 4, input = start + x * channels;
      if (color === 3) {
        const bit = x * depth, index = (raw[start + (bit >>> 3)] >>> (8 - depth - (bit & 7))) & ((1 << depth) - 1);
        if (index * 3 >= palette!.length) throw new Error(`PNG palette index ${index} is out of bounds.`);
        rgba[output] = palette![index * 3]; rgba[output + 1] = palette![index * 3 + 1]; rgba[output + 2] = palette![index * 3 + 2];
        rgba[output + 3] = transparency && index < transparency.length ? transparency[index] : 255;
      } else if (color === 0 || color === 4) {
        rgba[output] = rgba[output + 1] = rgba[output + 2] = raw[input];
        rgba[output + 3] = color === 4 ? raw[input + 1] : transparency && raw[input] === transparency.readUInt16BE(0) ? 0 : 255;
      } else {
        rgba[output] = raw[input]; rgba[output + 1] = raw[input + 1]; rgba[output + 2] = raw[input + 2];
        rgba[output + 3] = color === 6 ? raw[input + 3]
          : transparency && raw[input] === transparency.readUInt16BE(0) && raw[input + 1] === transparency.readUInt16BE(2) && raw[input + 2] === transparency.readUInt16BE(4) ? 0 : 255;
      }
    }
  }
  return { width, height, rgba, ...(profiles.size ? { warnings: [`PNG color-profile chunks (${[...profiles].join(", ")}) were not transformed; encoded RGBA samples were preserved.`] } : {}) };
}
