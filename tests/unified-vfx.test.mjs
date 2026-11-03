import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  createFrame3D, Painter3D, createFx3D, compositeFrame3D, enableHDRLight,
  CinematicCompositor, CinematicLighting3D,
  frostNova3D, arcSlash3D, blackHole3D, windRasenshuriken3D, windRasenshurikenLegacy3D,
} from "../build/3d/index.js";

const effects = [frostNova3D, arcSlash3D, blackHole3D, windRasenshuriken3D, windRasenshurikenLegacy3D];
const root = fileURLToPath(new URL("../", import.meta.url));
function draw(mod, fx, cinematic = false) {
  const frame = createFrame3D(96, 72);
  if (cinematic && mod !== blackHole3D) enableHDRLight(frame);
  const camera = { yaw: 0.32, elevation: 0.3, zoom: 1.1, target: [0, mod === frostNova3D ? 0.75 : mod === blackHole3D ? 1.12 : 2.35, 0] };
  const painter = new Painter3D(frame, camera);
  painter.begin("#061222");
  fx.draw(painter);
  const output = new Uint8ClampedArray(frame.w * frame.h * 4);
  if (cinematic) {
    const colors = frame.color.slice(), emission = frame.light.slice();
    const lighting = new CinematicLighting3D().evaluate(frame, camera, [
      { position: [-2, 3, 1], radius: 7, color: "#82ddff", intensity: 1.5 },
    ], { ambientOcclusion: { radius: 2, intensity: 0.3 } });
    assert.ok(lighting.radiance.every(Number.isFinite));
    new CinematicCompositor().render(frame, output, { radiance: lighting.radiance, occlusion: lighting.occlusion });
    assert.deepEqual(frame.color, colors);
    assert.deepEqual(frame.light, emission);
    if (frame.hdrLight) assert.ok(frame.hdrLight.some(value => value > 0));
  } else compositeFrame3D(frame, output);
  return output;
}

test("all integrated effects support deterministic cinematic and legacy composition", () => {
  for (const mod of effects) {
    const time = Math.min(1.5, mod.meta.duration * 0.4);
    const a = createFx3D(mod, { seed: 308 }); a.seek(time);
    const b = createFx3D(mod, { seed: 308 }); b.seek(time);
    const film = draw(mod, a, true);
    assert.deepEqual(film, draw(mod, b, true), mod.meta.id);
    assert.notDeepEqual(film, draw(mod, a, false), mod.meta.id);
  }
});

test("sequential GIF stepping matches fixed-step seek for every integrated effect", () => {
  for (const mod of effects) {
    const sequential = createFx3D(mod, { seed: 308 });
    const sampled = createFx3D(mod, { seed: 308 });
    const steps = Math.min(30, Math.floor(mod.meta.duration * 8));
    for (let i = 0; i < steps; i++) sequential.update(1 / 20);
    sampled.seek(steps / 20);
    assert.deepEqual(draw(mod, sequential, true), draw(mod, sampled, true), mod.meta.id);
  }
});

test("lens warp reuses snapshots and keeps HDR, depth and legacy light registered", () => {
  const frame = enableHDRLight(createFrame3D(64, 48));
  const painter = new Painter3D(frame, { yaw: 0, elevation: 0, zoom: 1 });
  const n = frame.w * frame.h;
  for (let i = 0; i < n; i++) {
    frame.color[i] = i + 1;
    frame.light[i] = (0xff000000 | (i + 1)) >>> 0;
    frame.depth[i] = i;
    frame.hdrLight[i * 3] = i;
    frame.hdrLight[i * 3 + 1] = i + 0.25;
    frame.hdrLight[i * 3 + 2] = i + 0.5;
  }
  painter.lensWarp([0, 0, 0], 0.5, 5, 1.5);
  assert.ok(frame.color.some((value, i) => value !== i + 1));
  for (let i = 0; i < n; i++) {
    const source = frame.color[i] - 1;
    assert.equal(frame.depth[i], source);
    assert.equal(frame.light[i], (0xff000000 | (source + 1)) >>> 0);
    assert.equal(frame.hdrLight[i * 3], source);
    assert.equal(frame.hdrLight[i * 3 + 1], source + 0.25);
    assert.equal(frame.hdrLight[i * 3 + 2], source + 0.5);
  }
  const snapshots = [painter.warpColor, painter.warpLight, painter.warpDepth, painter.warpHDR];
  painter.lensWarp([0, 0, 0], 0.5, 5, 1.5);
  assert.deepEqual([painter.warpColor, painter.warpLight, painter.warpDepth, painter.warpHDR].map((v, i) => v === snapshots[i]), [true, true, true, true]);
  painter.begin("#000");
  painter.glow([0, 0, 0], 2, "#fff", 4);
  const center = painter.project([0, 0, 0]);
  const i = Math.floor(center.y) * frame.w + Math.floor(center.x);
  assert.ok(frame.hdrLight[i * 3] > 0);
  painter.sphere([0, 0, 0], 1, "#000");
  assert.equal(frame.light[i], 0);
  assert.deepEqual(Array.from(frame.hdrLight.subarray(i * 3, i * 3 + 3)), [0, 0, 0]);
});

function cli(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { cwd: root, encoding: "utf8", timeout: 60000 });
  assert.equal(result.status, 0, result.error?.message ?? result.stderr);
}
test("cinematic PNG export retains wind variants, black hole, zero seed and sidecar paths", () => {
  const dir = mkdtempSync(join(tmpdir(), "poku-unified-png-"));
  try {
    for (const name of ["wind", "windOriginal", "blackhole"]) {
      const out = join(dir, name);
      cli("build-tools/tools/render-3d.mjs", [name, "--frames", "3", "--columns", "3", "--width", "48", "--height", "36", "--seed", "0", "--cinematic", "true", "--out", out]);
      assert.deepEqual([...readFileSync(out + ".png").subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      const metadata = JSON.parse(readFileSync(out + ".json", "utf8"));
      assert.equal(metadata.renderMode, "cinematic");
      assert.equal(metadata.options.seed, 0);
      assert.equal(metadata.timeSamples.length, 3);
    }
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test("cinematic wind GIF exports through the integrated renderer", t => {
  const ffmpeg = spawnSync("ffmpeg", ["-version"], { encoding: "utf8" });
  if (ffmpeg.error || ffmpeg.status !== 0) return t.skip("Optional ffmpeg is not installed");
  const dir = mkdtempSync(join(tmpdir(), "poku-unified-gif-"));
  try {
    const out = join(dir, "wind.gif");
    cli("build-tools/tools/render-3d-gif.mjs", ["wind", "--fps", "2", "--width", "48", "--height", "36", "--cinematic", "true", "--out", out]);
    const gif = readFileSync(out);
    assert.match(gif.subarray(0, 6).toString(), /^GIF8[79]a$/);
    assert.equal(gif.readUInt16LE(6), 96);
    assert.equal(gif.readUInt16LE(8), 72);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
