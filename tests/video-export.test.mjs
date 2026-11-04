import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { writeVideo } from "../build-tools/tools/lib/video.mjs";
import { writeVideo as publicWriteVideo, upscale } from "../build-tools/tools/lib/fxlib.mjs";

const hasFFmpeg = spawnSync("ffmpeg", ["-version"]).status === 0;
const hasFFprobe = spawnSync("ffprobe", ["-version"]).status === 0;
const scene = () => ({ w: 3, h: 2, fps: 4, frames: [
  { color: new Uint8ClampedArray([255,0,0,255, 0,255,0,255, 0,0,255,255, 255,255,0,255, 255,0,255,255, 0,255,255,255]) },
  { color: new Uint8ClampedArray([0,255,255,255, 255,0,255,255, 255,255,0,255, 0,0,255,255, 0,255,0,255, 255,0,0,255]) },
] });
function temporary(fn) {
  const dir = mkdtempSync(join(tmpdir(), "poku-video-test-"));
  try { return fn(dir); } finally { rmSync(dir, { recursive: true, force: true }); }
}
function run(command, args) {
  const res = spawnSync(command, args, { maxBuffer: 8 * 1024 * 1024 });
  assert.equal(res.status, 0, res.stderr?.toString());
  return res.stdout;
}
function probe(file) {
  return JSON.parse(run("ffprobe", ["-v", "error", "-count_frames", "-show_streams", "-of", "json", file])).streams[0];
}
function withEnv(env, fn) {
  const old = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
  Object.assign(process.env, env);
  try { return fn(); } finally {
    for (const key of Object.keys(env)) {
      if (old[key] === undefined) delete process.env[key]; else process.env[key] = old[key];
    }
  }
}

test("the existing fxlib synchronous export API remains available", () => {
  assert.equal(publicWriteVideo, writeVideo);
});

test("GIF preserves exact nearest-neighbor pixels, frame order, and repeated duration", { skip: !hasFFmpeg || !hasFFprobe }, () => temporary(dir => {
  const r = scene(), file = join(dir, "preview.gif");
  assert.equal(writeVideo(file, r, 3, { loops: 3 }), true);
  const meta = probe(file);
  assert.equal(meta.width, 9); assert.equal(meta.height, 6);
  assert.equal(Number(meta.nb_read_frames), 6);
  assert.ok(Math.abs(Number(meta.duration) - 1.5) < 0.011);
  const decoded = run("ffmpeg", ["-v", "error", "-i", file, "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  const bytes = 9 * 6 * 4;
  assert.equal(decoded.length, bytes * 6);
  for (let i = 0; i < 6; i++) {
    assert.deepEqual(decoded.subarray(i * bytes, (i + 1) * bytes), Buffer.from(upscale(r.frames[i % 2].color, 3, 2, 3)));
  }
}));

test("native-size GIF handles nonzero typed-array offsets without leaking surrounding bytes", { skip: !hasFFmpeg || !hasFFprobe }, () => temporary(dir => {
  const r = scene();
  r.frames = r.frames.map(f => {
    const data = new Uint8ClampedArray(f.color.length + 20).fill(19);
    data.set(f.color, 8);
    return { color: data.subarray(8, 8 + f.color.length) };
  });
  const file = join(dir, "offset.gif");
  assert.equal(writeVideo(file, r, 1), true);
  const decoded = run("ffmpeg", ["-v", "error", "-i", file, "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  assert.deepEqual(decoded, Buffer.concat(r.frames.map(f => Buffer.from(f.color))));
  assert.equal(Number(probe(file).nb_read_frames), 2);
}));

test("GIF retains transparency when opaque pixels move between frames", { skip: !hasFFmpeg || !hasFFprobe }, () => temporary(dir => {
  const r = scene(), file = join(dir, "transparent.gif");
  r.frames[0].color[3] = 0;
  r.frames[1].color[7] = 0;
  assert.equal(writeVideo(file, r, 2, { loops: 2 }), true);
  const decoded = run("ffmpeg", ["-v", "error", "-i", file, "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  const bytes = 6 * 4 * 4;
  assert.equal(decoded.length, bytes * 4);
  for (let frame = 0; frame < 4; frame++) {
    const expected = upscale(r.frames[frame % 2].color, r.w, r.h, 2);
    for (let pixel = 0; pixel < bytes; pixel += 4) {
      const actual = decoded.subarray(frame * bytes + pixel, frame * bytes + pixel + 4);
      assert.equal(actual[3], expected[pixel + 3]);
      if (expected[pixel + 3]) assert.deepEqual(actual, Buffer.from(expected.subarray(pixel, pixel + 4)));
    }
  }
}));

test("MP4 pads odd dimensions and repeats the native sequence at the requested fps", { skip: !hasFFmpeg || !hasFFprobe }, () => temporary(dir => {
  const file = join(dir, "preview.mp4");
  assert.equal(writeVideo(file, scene(), 3, { loops: 3 }), true);
  const meta = probe(file);
  assert.equal(meta.width, 10); assert.equal(meta.height, 6);
  assert.equal(meta.pix_fmt, "yuv420p");
  assert.equal(meta.r_frame_rate, "4/1");
  assert.equal(Number(meta.nb_read_frames), 6);
  assert.ok(Math.abs(Number(meta.duration) - 1.5) < 0.001);
}));

test("MP4 preserves fractional frame rates across repeated sequences", { skip: !hasFFmpeg || !hasFFprobe }, () => temporary(dir => {
  const file = join(dir, "fractional.MP4"), r = { ...scene(), fps: 7.5 };
  assert.equal(writeVideo(file, r, 1, { loops: 4 }), true);
  const meta = probe(file);
  assert.equal(meta.r_frame_rate, "15/2");
  assert.equal(Number(meta.nb_read_frames), 8);
  assert.ok(Math.abs(Number(meta.duration) - 8 / 7.5) < 0.001);
}));

test("MP4 scaling preserves the legacy RGBA-to-YUV color conversion", { skip: !hasFFmpeg }, () => temporary(dir => {
  const r = scene(), scale = 3, loops = 2, w = r.w * scale, h = r.h * scale;
  const raw = join(dir, "legacy.rgba"), reference = join(dir, "legacy.mp4"), actual = join(dir, "bounded.mp4");
  const frames = [];
  for (let loop = 0; loop < loops; loop++) for (const frame of r.frames) {
    frames.push(Buffer.from(upscale(frame.color, r.w, r.h, scale)));
  }
  writeFileSync(raw, Buffer.concat(frames));
  run("ffmpeg", ["-v", "error", "-y", "-f", "rawvideo", "-pix_fmt", "rgba", "-s", `${w}x${h}`, "-r", String(r.fps), "-i", raw,
    "-vf", `pad=${w + w % 2}:${h + h % 2}:0:0:black,format=yuv420p`,
    "-c:v", "libx264", "-crf", "14", "-preset", "slow", "-movflags", "+faststart", reference]);
  assert.equal(writeVideo(actual, r, scale, { loops }), true);
  const decode = file => run("ffmpeg", ["-v", "error", "-i", file, "-vsync", "0", "-f", "rawvideo", "-pix_fmt", "rgba", "-"]);
  assert.deepEqual(decode(actual), decode(reference));
}));

test("invalid video parameters fail before touching the filesystem", () => temporary(dir => {
  const file = join(dir, "new", "bad.gif");
  const r = scene();
  for (const value of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => writeVideo(file, r, value), RangeError);
    assert.throws(() => writeVideo(file, r, 1, { loops: value }), RangeError);
    assert.throws(() => writeVideo(file, { ...r, w: value }, 1), RangeError);
    assert.throws(() => writeVideo(file, { ...r, h: value }, 1), RangeError);
  }
  for (const fps of [0, -1, NaN, Infinity]) assert.throws(() => writeVideo(file, { ...r, fps }, 1), RangeError);
  assert.throws(() => writeVideo(file, { ...r, frames: [] }, 1), RangeError);
  assert.throws(() => writeVideo(file, { ...r, frames: [{ color: new Uint8ClampedArray(3) }] }, 1), RangeError);
  assert.equal(existsSync(join(dir, "new")), false);
}));

test("missing ffmpeg returns false without leaving staging files", () => temporary(dir => {
  withEnv({ PATH: dir, TMPDIR: dir }, () => {
    assert.equal(writeVideo(join(dir, "missing.gif"), scene(), 1), false);
    assert.deepEqual(readdirSync(dir), []);
  });
}));

test("the exporter stages only one native sequence, independent of scale and loops, then cleans it", () => temporary(dir => {
  const log = join(dir, "calls.jsonl"), binary = join(dir, "ffmpeg");
  writeFileSync(binary, `#!${process.execPath}\n` + `
    const fs = require('node:fs');
    const args = process.argv.slice(2);
    if (args.includes('-version')) process.exit(0);
    const raw = args.find(a => a.endsWith('frames.rgba'));
    fs.appendFileSync(${JSON.stringify(log)}, JSON.stringify({ args, raw, bytes: [...fs.readFileSync(raw)] }) + '\\n');
    fs.writeFileSync(args.at(-1), 'test output');
  `, { mode: 0o755 });
  withEnv({ PATH: dir, TMPDIR: dir }, () => {
    assert.equal(writeVideo(join(dir, "large.gif"), scene(), 20, { loops: 100 }), true);
  });
  const calls = readFileSync(log, "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(calls.length, 2);
  const native = [...scene().frames.flatMap(f => [...f.color])];
  for (const call of calls) {
    assert.deepEqual(call.bytes, native);
    assert.equal(existsSync(call.raw), false);
    assert.equal(call.args[call.args.indexOf("-s") + 1], "3x2");
  }
  assert.equal(calls[0].args.includes("-stream_loop"), false, "palette is built only once from native pixels");
  assert.equal(calls[1].args[calls[1].args.indexOf("-stream_loop") + 1], "99");
  assert.ok(calls[1].args.some(a => a.includes("scale=60:40:flags=neighbor")));
  assert.equal(readdirSync(dir).some(name => name.startsWith("poku-video-")), false);
}));

for (const phase of ["palette", "encode"]) {
  test(`${phase} failures are reported and all staging files are removed`, () => temporary(dir => {
    const binary = join(dir, "ffmpeg");
    writeFileSync(binary, `#!${process.execPath}\n` + `
      if (process.argv.includes('-version')) process.exit(0);
      if (${JSON.stringify(phase)} === 'encode' && process.argv.at(-1).endsWith('palette.png')) {
        require('node:fs').writeFileSync(process.argv.at(-1), 'palette'); process.exit(0);
      }
      process.stderr.write('intentional encoder failure'); process.exit(23);
    `, { mode: 0o755 });
    withEnv({ PATH: dir, TMPDIR: dir }, () => {
      assert.throws(() => writeVideo(join(dir, "failure.gif"), scene(), 2), /intentional encoder failure/);
      assert.equal(readdirSync(dir).some(name => name.startsWith("poku-video-")), false);
    });
  }));
}
