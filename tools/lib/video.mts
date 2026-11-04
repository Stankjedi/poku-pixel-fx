/** Memory-bounded synchronous preview export. ffmpeg does the nearest-neighbor scaling. */
import { closeSync, mkdirSync, mkdtempSync, openSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";

export interface VideoFrames {
  w: number;
  h: number;
  fps: number;
  frames: Array<{ color: Uint8ClampedArray }>;
}

/** Animated preview through ffmpeg (GIF or MP4), scaled k times. Returns false only if ffmpeg is missing.
 * Stages one native-size RGBA sequence on disk, independent of scale/loops, and always removes it.
 * GIF palette generation is a separate pass so ffmpeg need not retain every enlarged frame either.
 */
export function writeVideo(file: string, r: VideoFrames, k: number, { loops = 1 } = {}): boolean {
  const { w, h, frames, fps } = r;
  for (const [name, value] of Object.entries({ width: w, height: h, scale: k, loops })) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name} must be a positive integer`);
  }
  if (!Number.isFinite(fps) || fps <= 0) throw new RangeError("fps must be finite and positive");
  if (!frames.length) throw new RangeError("At least one video frame is required");
  const W = w * k, H = h * k, bytes = w * h * 4;
  if (![W, H, bytes, bytes * frames.length, frames.length * loops].every(Number.isSafeInteger))
    throw new RangeError("Video dimensions or frame count are too large");
  for (const f of frames) {
    if (f.color.byteLength !== bytes) throw new RangeError(`Every frame must contain exactly ${bytes} RGBA bytes`);
  }
  const execute = (args: string[]) => {
    const result = spawnSync("ffmpeg", ["-v", "error", "-nostdin", "-y", ...args], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`ffmpeg 실행 실패: ${result.stderr || result.signal || result.status}`);
  };
  // Preserve the optional-encoder contract without silently hiding other I/O or encoder failures.
  const probe = spawnSync("ffmpeg", ["-version"], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  if (probe.error && (probe.error as NodeJS.ErrnoException).code === "ENOENT") return false;
  if (probe.error) throw probe.error;
  if (probe.status !== 0) throw new Error(`ffmpeg 실행 실패: ${probe.stderr || probe.signal || probe.status}`);

  const temp = mkdtempSync(join(tmpdir(), "poku-video-"));
  try {
    const raw = join(temp, "frames.rgba"), fd = openSync(raw, "w");
    try {
      for (const f of frames) {
        // Respect subarray offsets; Buffer.from(array.buffer) would leak unrelated prefix/suffix bytes.
        writeFileSync(fd, Buffer.from(f.color.buffer, f.color.byteOffset, f.color.byteLength));
      }
    } finally { closeSync(fd); }
    const input = ["-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(fps)];
    const repeated = [...input, "-stream_loop", String(loops - 1), "-i", raw];
    const scale = `scale=${W}:${H}:flags=neighbor`;
    mkdirSync(dirname(file), { recursive: true });
    if (file.toLowerCase().endsWith(".mp4")) {
      const evenW = W + W % 2, evenH = H + H % 2;
      // Keep nearest scaling in RGBA. Letting scale also convert to subsampled YUV changes edge colors.
      execute([...repeated, "-vf", `${scale},format=rgba,pad=${evenW}:${evenH}:0:0:black,format=yuv420p`,
        "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-movflags", "+faststart", file]);
    } else {
      const palette = join(temp, "palette.png");
      // Repeated/scaled copies contain the same colors, so only the native sequence builds the palette.
      execute([...input, "-i", raw, "-vf", "palettegen=max_colors=255:stats_mode=full", "-frames:v", "1", palette]);
      execute([...repeated, "-i", palette, "-filter_complex", `[0:v]${scale}[scaled];[scaled][1:v]paletteuse=dither=none[out]`,
        "-map", "[out]", "-loop", "0", file]);
    }
    return true;
  } finally { rmSync(temp, { recursive: true, force: true }); }
}
