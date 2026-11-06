/** Native PNG samples must not pass through a premultiplied Canvas image decoder.
 * This browser importer keeps straight RGB even under alpha 0 or 1. Color-profile
 * transforms are deliberately not applied; relevant metadata is reported separately.
 */
export type NativePixelPNGResult =
  | { kind: 'decoded'; w: number; h: number; pixels: Uint32Array; warnings: string[] }
  | { kind: 'unsupported'; w: number; h: number; reason: '16-bit' | 'adam7'; warnings: string[] };

const MAX_FILE_BYTES = 16 * 1024 * 1024;
const MAX_DIMENSION = 512;
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const CRC = new Uint32Array(256);
for (let n = 0; n < CRC.length; n++) {
  let c = n;
  for (let bit = 0; bit < 8; bit++) c = c & 1 ? 0xedb88320 ^ c >>> 1 : c >>> 1;
  CRC[n] = c >>> 0;
}
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC[(crc ^ byte) & 255] ^ crc >>> 8;
  return (crc ^ 0xffffffff) >>> 0;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c);
  return da <= db && da <= dc ? a : db <= dc ? b : c;
}
function view(bytes: Uint8Array): DataView { return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); }

/** Read incrementally into the exact expected allocation; cancel on excess output.
 * DecompressionStream validates zlib framing/checksum and rejects truncated streams.
 * Feeding small compressed blocks also avoids eagerly queuing the whole encoded file.
 */
async function inflate(blocks: Uint8Array[], expected: number): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new Error('Native PNG import requires DecompressionStream support.');
  const compressed = new Uint8Array(blocks.reduce((sum, block) => sum + block.length, 0));
  let end = 0;
  for (const block of blocks) { compressed.set(block, end); end += block.length; }
  let position = 0;
  const stream = new ReadableStream<BufferSource>({
    pull(controller) {
      if (position === compressed.length) { controller.close(); return; }
      const next = Math.min(position + 4096, compressed.length);
      controller.enqueue(compressed.subarray(position, next)); position = next;
    },
  }).pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader(), raw = new Uint8Array(expected);
  let written = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value.length > expected - written) throw new Error('PNG inflated data exceeds its declared dimensions.');
      raw.set(value, written); written += value.length;
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    if (error instanceof Error && error.message.startsWith('PNG inflated data')) throw error;
    throw new Error('Invalid or truncated PNG compressed data.');
  } finally {
    reader.releaseLock();
  }
  if (written !== expected) throw new Error('PNG inflated data length does not match its dimensions.');
  return raw;
}

interface Pass { w: number; h: number; rowBytes: number }
function passesFor(w: number, h: number, channels: number, depth: number, interlace: number): Pass[] {
  const patterns = interlace ? [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]] : [[0, 0, 1, 1]];
  return patterns.map(([x, y, dx, dy]) => {
    const width = Math.max(0, Math.ceil((w - x) / dx)), height = Math.max(0, Math.ceil((h - y) / dy));
    return { w: width, h: height, rowBytes: Math.ceil(width * channels * depth / 8) };
  }).filter(pass => pass.w > 0 && pass.h > 0);
}

/** Decode ordinary native PNGs without changing straight color/coverage samples.
 * Supported: noninterlaced gray/indexed 1/2/4/8-bit and RGB/gray-alpha/RGBA 8-bit.
 * Valid 16-bit or Adam7 data returns an explicit fallback result only after structural,
 * checksum, inflation-size and row-filter validation. Malformed data always throws;
 * callers must never interpret validation errors as permission for a browser fallback.
 */
export async function decodePixelArtPNG(png: Uint8Array): Promise<NativePixelPNGResult> {
  if (!(png instanceof Uint8Array) || png.length < 8 || SIGNATURE.some((value, i) => png[i] !== value))
    throw new Error('Invalid PNG signature.');
  if (png.length > MAX_FILE_BYTES) throw new Error('PNG exceeds the 16 MiB file limit.');
  const bytes = view(png);
  let w = 0, h = 0, depth = 0, color = -1, channels = 0, interlace = 0;
  let seenHeader = false, seenData = false, dataEnded = false, seenEnd = false, chunkCount = 0;
  let palette: Uint8Array | undefined, transparency: Uint8Array | undefined;
  const blocks: Uint8Array[] = [], profiles = new Set<string>();
  for (let offset = 8; offset < png.length;) {
    if (++chunkCount > 65_536) throw new Error('PNG exceeds the 65,536 chunk import limit.');
    if (png.length - offset < 12) throw new Error('Truncated PNG chunk header or CRC.');
    const length = bytes.getUint32(offset);
    if (length > 0x7fffffff || length > png.length - offset - 12) throw new Error('PNG chunk length exceeds file bounds.');
    const typeBytes = png.subarray(offset + 4, offset + 8), type = String.fromCharCode(...typeBytes);
    if (typeBytes.some(value => !(value >= 65 && value <= 90 || value >= 97 && value <= 122)) || typeBytes[2] & 32)
      throw new Error('Invalid PNG chunk type.');
    const data = png.subarray(offset + 8, offset + 8 + length);
    if (crc32(png.subarray(offset + 4, offset + 8 + length)) !== bytes.getUint32(offset + 8 + length))
      throw new Error(`PNG CRC mismatch in ${type}.`);
    if (!seenHeader && type !== 'IHDR') throw new Error('PNG IHDR must be the first chunk.');
    if (seenData && type !== 'IDAT') dataEnded = true;
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT')
      throw new Error('Animated PNG (APNG) is not a single artwork; import a PNG sprite sheet instead.');
    switch (type) {
      case 'IHDR': {
        if (seenHeader || length !== 13) throw new Error('PNG requires exactly one 13-byte IHDR.');
        seenHeader = true;
        w = view(data).getUint32(0); h = view(data).getUint32(4); depth = data[8]; color = data[9]; interlace = data[12];
        if (!w || !h || w > MAX_DIMENSION || h > MAX_DIMENSION)
          throw new Error('PNG dimensions must be within 1..512 native cells per axis.');
        if (data[10] !== 0 || data[11] !== 0) throw new Error('Invalid PNG compression or filter method.');
        if (interlace !== 0 && interlace !== 1) throw new Error('Invalid PNG interlace method.');
        const allowed = color === 0 ? [1, 2, 4, 8, 16] : color === 3 ? [1, 2, 4, 8] : [2, 4, 6].includes(color) ? [8, 16] : [];
        if (!allowed.includes(depth)) throw new Error(`Invalid PNG color type ${color} / bit depth ${depth}.`);
        channels = color === 0 || color === 3 ? 1 : color === 2 ? 3 : color === 4 ? 2 : 4;
        break;
      }
      case 'PLTE':
        if (palette || seenData || transparency || color === 0 || color === 4 || !length || length % 3 || length > 768 || color === 3 && length / 3 > 2 ** depth)
          throw new Error('Invalid PNG palette size, color type, or chunk order.');
        palette = data.slice();
        break;
      case 'tRNS':
        if (transparency || seenData) throw new Error('Duplicate or misplaced PNG tRNS chunk.');
        if (color === 3 ? !palette || length > palette.length / 3 : color === 0 ? length !== 2 : color === 2 ? length !== 6 : true)
          throw new Error('Invalid PNG tRNS transparency for its color type.');
        transparency = data.slice();
        break;
      case 'IDAT':
        if (dataEnded) throw new Error('PNG IDAT chunks must be consecutive.');
        if (color === 3 && !palette) throw new Error('Indexed PNG is missing its PLTE palette.');
        seenData = true; blocks.push(data);
        break;
      case 'IEND':
        if (length !== 0 || !seenData) throw new Error('Invalid PNG IEND or missing image data.');
        if (offset + 12 !== png.length) throw new Error('Unexpected bytes after PNG IEND.');
        seenEnd = true;
        break;
      default:
        if (!(typeBytes[0] & 32)) throw new Error(`Unsupported critical PNG chunk ${type}.`);
        if (['iCCP', 'sRGB', 'gAMA', 'cHRM', 'cICP', 'mDCV', 'cLLI'].includes(type)) profiles.add(type);
    }
    offset += length + 12;
  }
  if (!seenEnd) throw new Error('PNG is missing IEND.');
  const passes = passesFor(w, h, channels, depth, interlace);
  const expected = passes.reduce((sum, pass) => sum + (pass.rowBytes + 1) * pass.h, 0);
  const raw = await inflate(blocks, expected), bytesPerPixel = Math.max(1, Math.ceil(channels * depth / 8));
  let offset = 0;
  for (const pass of passes) {
    for (let y = 0; y < pass.h; y++) {
      const start = offset + y * (pass.rowBytes + 1) + 1, previous = start - pass.rowBytes - 1, filter = raw[start - 1];
      if (filter > 4) throw new Error(`Invalid PNG row filter ${filter}.`);
      for (let x = 0; x < pass.rowBytes; x++) {
        const left = x >= bytesPerPixel ? raw[start + x - bytesPerPixel] : 0;
        const up = y ? raw[previous + x] : 0, upperLeft = y && x >= bytesPerPixel ? raw[previous + x - bytesPerPixel] : 0;
        const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left + up) / 2) : paeth(left, up, upperLeft);
        raw[start + x] = (raw[start + x] + predictor) & 255;
      }
      if (color === 3) for (let x = 0; x < pass.w; x++) {
        const bit = x * depth, index = raw[start + (bit >>> 3)] >>> (8 - depth - (bit & 7)) & (1 << depth) - 1;
        if (index * 3 >= palette!.length) throw new Error(`PNG palette index ${index} is out of bounds.`);
      }
    }
    offset += (pass.rowBytes + 1) * pass.h;
  }
  const warnings = profiles.size ? [`PNG color-profile chunks (${[...profiles].join(', ')}) were not transformed; encoded straight samples are preserved.`] : [];
  if (depth === 16 || interlace === 1)
    return { kind: 'unsupported', w, h, reason: depth === 16 ? '16-bit' : 'adam7', warnings };

  const pixels = new Uint32Array(w * h), rowBytes = passes[0].rowBytes, sampleMask = (1 << depth) - 1;
  // PNG third edition requires unused high bits in grayscale/RGB tRNS samples to be masked.
  const keys = transparency && color !== 3 ? Array.from({ length: color === 0 ? 1 : 3 }, (_, i) => view(transparency!).getUint16(i * 2) & sampleMask) : undefined;
  for (let y = 0; y < h; y++) {
    const start = y * (rowBytes + 1) + 1;
    for (let x = 0; x < w; x++) {
      const input = start + x * channels;
      let r: number, g: number, b: number, a: number;
      if (color === 3) {
        const bit = x * depth, index = raw[start + (bit >>> 3)] >>> (8 - depth - (bit & 7)) & sampleMask;
        r = palette![index * 3]; g = palette![index * 3 + 1]; b = palette![index * 3 + 2];
        a = transparency && index < transparency.length ? transparency[index] : 255;
      } else if (color === 0 || color === 4) {
        const bit = x * depth, sample = depth < 8 ? raw[start + (bit >>> 3)] >>> (8 - depth - (bit & 7)) & sampleMask : raw[input];
        r = g = b = Math.round(sample * 255 / sampleMask);
        a = color === 4 ? raw[input + 1] : keys && sample === keys[0] ? 0 : 255;
      } else {
        r = raw[input]; g = raw[input + 1]; b = raw[input + 2];
        a = color === 6 ? raw[input + 3] : keys && r === keys[0] && g === keys[1] && b === keys[2] ? 0 : 255;
      }
      pixels[y * w + x] = (r | g << 8 | b << 16 | a << 24) >>> 0;
    }
  }
  return { kind: 'decoded', w, h, pixels, warnings };
}
