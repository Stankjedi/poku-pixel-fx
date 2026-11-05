/** Memory-bounded synchronous preview export. ffmpeg does the nearest-neighbor scaling. */
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export interface VideoFrames {
  w: number;
  h: number;
  fps: number;
  n?: number;
  /** A collector is optional. Streams are consumed once and never retained. */
  frames: Iterable<{ color: Uint8ClampedArray }>;
}
export interface VideoOutput { file: string; scale: number; loops?: number }

/** Encode one requested animation. Returns false only when ffmpeg is unavailable. */
export function writeVideo(file: string, r: VideoFrames, k: number, { loops = 1 } = {}): boolean {
  return writeVideos([{ file, scale: k, loops }], r);
}

/**
 * Stage one native RGBA sequence, then encode all requested formats/scales from it.
 * The sequence may be a generator that also fills contact/atlas sinks. No full
 * raw frame sequence is held in RAM, and GIF/MP4 together do not render it twice.
 */
export function writeVideos(outputs: readonly VideoOutput[], r: VideoFrames): boolean {
  const { w, h, frames, fps } = r, bytes = w * h * 4;
  if (!outputs.length) throw new RangeError("At least one video output is required");
  for (const [name, value] of Object.entries({ width: w, height: h })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
  }
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError("fps must be finite and positive");
  if (!Number.isSafeInteger(bytes)) throw new RangeError("Video dimensions are too large");
  for (const { scale, loops = 1 } of outputs) {
    if (!Number.isSafeInteger(scale) || scale < 1 || !Number.isSafeInteger(loops) || loops < 1)
      throw new RangeError("scale and loops must be positive integers");
    if (![w * scale, h * scale].every(Number.isSafeInteger)) throw new RangeError("Video dimensions are too large");
  }
  const validate = (f: { color: Uint8ClampedArray }) => {
    if (f.color.byteLength !== bytes) throw new RangeError(`Every frame must contain exactly ${bytes} RGBA bytes`);
  };
  // Preserve immediate validation for existing array callers, without enumerating a stream twice.
  if (Array.isArray(frames)) {
    if (!frames.length) throw new RangeError("At least one video frame is required");
    for (const frame of frames) validate(frame);
  }
  const execute = (args: string[]) => {
    const result = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ffmpeg 실행 실패: ${result.stderr || result.signal || result.status}`);
  };
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") return false;
  if (probe.error) throw probe.error;
  if (probe.status !== 0) throw new Error(`ffmpeg 실행 실패: ${probe.stderr || probe.signal || probe.status}`);

  const temp = mkdtempSync(join(tmpdir(), "poku-video-"));
  try {
    const raw = join(temp, "frames.rgba"), fd = openSync(raw, "w");
    let count = 0;
    try {
      for (const f of frames) {
        validate(f); count++;
        if (!Number.isSafeInteger(count * bytes)) throw new RangeError("Video sequence is too large");
        // Respect subarray offsets rather than leaking unrelated prefix/suffix bytes.
        writeFileSync(fd, Buffer.from(f.color.buffer, f.color.byteOffset, f.color.byteLength));
      }
    } finally { closeSync(fd); }
    if (!count) throw new RangeError("At least one video frame is required");
    if (r.n !== undefined && count !== r.n) throw new RangeError(`Expected ${r.n} video frames, received ${count}`);
    const input = ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(fps)];
    const palette = join(temp, "palette.png");
    let paletteReady = false;
    for (const { file, scale: k, loops = 1 } of outputs) {
      if (!Number.isSafeInteger(count * loops)) throw new RangeError("Repeated video is too long");
      const W = w * k, H = h * k, repeated = [...input, "-stream_loop", String(loops - 1), "-i", raw];
      const scale = `scale=${W}:${H}:flags=neighbor`;
      mkdirSync(dirname(file), { recursive: true });
      if (file.toLowerCase().endsWith(".mp4")) {
        const evenW = W + W % 2, evenH = H + H % 2;
        execute([...repeated, "-vf", `${scale},format=rgba,pad=${evenW}:${evenH}:0:0:black,format=yuv420p`,
          "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-movflags", "+faststart", file]);
      } else {
        if (!paletteReady) {
          execute([...input, "-i", raw, "-vf", "palettegen=max_colors=255:stats_mode=full", "-frames:v", "1", palette]);
          paletteReady = true;
        }
        execute([...repeated, "-i", palette, "-filter_complex", `[0:v]${scale}[scaled];[scaled][1:v]paletteuse=dither=none[out]`,
          "-map", "[out]", "-loop", "0", file]);
      }
    }
    return true;
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
