#!/usr/bin/env node
// Check effects for the mistakes eyes miss: missing meta, drawing outside the canvas, one-shots that don't
// end clean, loops with a seam, randomness that isn't seeded, slow frames.
//
//   node tools/check.mjs              every effect
//   node tools/check.mjs fire ui/level-up

import { readFileSync } from "node:fs";
const { shortfall } = await import(new URL("../../build/core/rig.js", import.meta.url).href);
import { resolveIds, allIds, loadEffect } from "./lib/fxlib.mjs";
const { createFrame, clearFrame, painterFor, createFx, createAct, poseAt, stockActor, resolveOptions, Painter, BACKDROPS } = await import(new URL("../../build/core/index.js", import.meta.url).href);

const ids = process.argv.slice(2).length ? resolveIds(process.argv.slice(2)) : allIds();
const M = 24; // margin around the canvas, to catch pixels drawn outside it
let fails = 0, warns = 0;

function drawAt(fx: any, t: number, frame: any, opts: Record<string, any>) {
  const { mod, meta } = fx, p = painterFor(clearFrame(frame));
  p.place(meta.origin[0], meta.origin[1]);
  if (mod.drawBack) mod.drawBack(p, t, opts);
  mod.draw(p, t, opts);
}
// an act: its data makes sense, and the body doesn't teleport when no key asked it to
const POSE_KEYS = new Set("x y crouch lean twist turn yaw hx hy fx fy fz bx by bz ffx ffy fbx fby fzz bzz weapon sa two offWeapon sb armsFront toeF toeB face ghost wl wz pull nocked".split(" "));
const hands = (q: Record<string, number>) => [q.fx ?? 7, q.fy ?? -14, q.bx ?? -8, q.by ?? -14];
function checkAct(fx: any, errs: string[], notes: string[]) {
  const { mod, meta } = fx, a = mod.act, k = a.poses;
  if (!Array.isArray(k) || !k.length) return errs.push("act.poses가 비어 있습니다");
  k.forEach(([t, pose], i) => {
    if (typeof t !== "number") errs.push(`act 키 ${i}: 시간이 없습니다`);
    if (i && t < k[i - 1][0]) errs.push(`시간 ${t}에서 act 키 순서가 잘못되었습니다`);
    for (const n of Object.keys(pose)) if (!POSE_KEYS.has(n)) errs.push(`시간 ${t}의 act 키: 알 수 없는 포즈 필드 "${n}"`);
  });
  // arms don't stretch: a hand asked to go further than it can falls short of where the effect needs it
  for (const [t, pose] of k) {
    const short = shortfall(pose);
    if (short > 3.5) { notes.push(`act: t = ${t}에서 손이 포즈의 목표 위치에 ${short.toFixed(0)} px 못 미칩니다. 몸을 앞으로 옮기세요`); break; }
  }
  const first = k[0][0], last = k[k.length - 1][0], D = meta.duration;
  for (const h of a.hits ?? []) {
    if (!(h.t >= first && h.t <= Math.max(last, D))) errs.push(`시간 ${h.t}의 act 타격이 act 범위를 벗어납니다`);
    if (h.stop > 0.3) notes.push(`시간 ${h.t}의 act 타격이 ${h.stop}초 동안 멈춥니다. 0.3초를 넘으면 동작이 멈춘 듯 보일 수 있습니다`);
  }
  if (meta.loop) {
    if (last !== D) errs.push(`반복 포즈는 ${last}가 아니라 지속 시간 ${D}에 끝나야 합니다`);
    const from = k.findIndex(([t]) => t >= 0);
    if (k[from]?.[0] !== 0) errs.push("반복 포즈에는 t = 0인 키가 필요합니다");
    else {
      const A = poseAt(k, 0), B = poseAt(k, D);
      const seam = Math.max(...hands(A).map((v, i) => Math.abs(v - hands(B)[i])), Math.abs((A.crouch ?? 0) - (B.crouch ?? 0)), Math.abs((A.x ?? 0) - (B.x ?? 0)));
      if (seam > 2) notes.push(`act 반복 경계에서 마지막 포즈와 첫 포즈 사이에 몸이 ${seam.toFixed(0)} px 튑니다`);
    }
  } else if (last < D - 1e-3 && last < 0) errs.push("act 포즈가 이펙트 시작 전에 끝납니다");
  // the smooth stretches: a hand moving more than this in one 12 fps step is a pop nobody asked for
  for (let i = 1; i < k.length; i++) {
    const [t0, , ] = k[i - 1], [t1, , how] = k[i];
    if (how === "snap" || t1 - t0 < 1 / 12) continue;
    for (let t = t0; t < t1 - 1 / 12; t += 1 / 12) {
      const p = hands(poseAt(k, t)), q = hands(poseAt(k, t + 1 / 12)), d = Math.max(Math.hypot(p[0] - q[0], p[1] - q[1]), Math.hypot(p[2] - q[2], p[3] - q[3]));
      if (d > 30) { notes.push(`act: t = ${t.toFixed(2)}에서 한 스텝 동안 손이 ${d.toFixed(0)} px 튑니다. 키를 추가하거나 "snap"으로 지정하세요`); break; }
    }
  }
  // it runs, ends and doesn't throw
  const inst = createAct(mod, { x: 100, y: 100 }), f = createFrame(400, 300);
  for (let i = 0; i < 900 && !inst.done(); i++) {
    inst.update(1 / 30);
    if (i % 3 === 0) inst.draw(clearFrame(f));
  }
  if (!meta.loop && !inst.done()) errs.push("act가 끝나지 않습니다");
}
const count = (buf: Uint32Array, test: (v: number, i: number) => boolean | number) => {
  let n = 0;
  for (let i = 0; i < buf.length; i++) if (test(buf[i], i)) n++;
  return n;
};

for (const id of ids) {
  const errs = [], notes = [];
  try {
    const fx = await loadEffect(id), { meta, mod } = fx;
    const src = readFileSync(fx.file, "utf8");
    // meta
    if (typeof meta.name !== "string" || !meta.name) errs.push("meta.name이 없습니다");
    if (typeof meta.desc !== "string" || meta.desc.length < 12) errs.push("meta.desc가 없거나 너무 짧습니다");
    if (meta.desc?.length > 180) notes.push(`desc가 ${meta.desc.length}자입니다. 180자 미만으로 유지하세요`);
    if (!Array.isArray(meta.tags) || !meta.tags.length) errs.push("meta.tags가 없습니다");
    if (!Array.isArray(meta.size) || meta.size.some((v: number) => !Number.isInteger(v) || v < 8 || v > 480)) errs.push("meta.size는 [w, h]여야 하며 각 값은 8~480의 정수 픽셀이어야 합니다");
    if (!Array.isArray(meta.origin) || meta.origin.length !== 2) errs.push("meta.origin은 [x, y]여야 합니다");
    if (!(meta.duration > 0 && meta.duration <= 12)) errs.push("meta.duration은 0초보다 크고 12초 이하여야 합니다");
    if (!BACKDROPS.includes(meta.bg)) errs.push(`meta.bg는 다음 값 중 하나여야 합니다: ${BACKDROPS.join(", ")}`);
    const taken = Object.keys(meta.options ?? {}).filter((k) => ["x", "y", "flip", "angle", "light"].includes(k));
    if (taken.length) errs.push(`옵션 ${taken.join(", ")}은 위치와 발광에 예약되어 있습니다. 이름을 바꾸세요`);
    if (/Math\.random/.test(src)) errs.push("Math.random을 사용합니다. 프레임을 재현할 수 있도록 rng/rand/burst/cycle을 사용하세요");
    if (mod.act) checkAct(fx, errs, notes);
    if (errs.length) throw new Error(errs.join("; "));

    const [W, H] = meta.size, frame = createFrame(W + M * 2, H + M * 2, -M, -M);
    const fw = frame.w, inside = (i: number) => {
      const x = (i % fw) - M, y = Math.floor(i / fw) - M;
      return x >= 0 && y >= 0 && x < W && y < H;
    };
    const opts = { ...(meta.options ?? {}), seed: meta.options?.seed ?? 1 };
    if (meta.actor) opts.actor = stockActor(meta.actor === 2 ? 2 : 1);
    const n = Math.max(2, Math.round(meta.duration * meta.fps));
    let maxPx = 0, spill = 0, spillLight = 0, ms: number[] = [], bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity;
    const bounds = () => frame.color.forEach((c: number, j: number) => {
      if (!(c >>> 24)) return;
      const x = (j % fw) - M, y = Math.floor(j / fw) - M;
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x); by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    });
    if (!mod.create) {
      for (let i = 0; i <= n; i++) {
        const t = meta.loop ? ((i % n) / n) * meta.duration : (i / n) * meta.duration;
        const t0 = performance.now();
        drawAt(fx, t, frame, opts);
        ms.push(performance.now() - t0);
        maxPx = Math.max(maxPx, count(frame.color, (c, j) => c >>> 24 && inside(j)), count(frame.light, (c, j) => (c & 0xffffff) && inside(j)));
        spill = Math.max(spill, count(frame.color, (c, j) => c >>> 24 && !inside(j)));
        bounds();
        spillLight = Math.max(spillLight, count(frame.light, (c, j) => (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255) > 90 && !inside(j)));
      }
      // other seeds can throw particles further: look for spills with a few more
      for (const seed of [2, 3, 7]) {
        const o2 = { ...opts, seed };
        for (let i = 0; i <= n; i += 2) {
          drawAt(fx, meta.loop ? ((i % n) / n) * meta.duration : (i / n) * meta.duration, frame, o2);
          const sp = count(frame.color, (c, j) => c >>> 24 && !inside(j));
          if (sp > spill) (spill = sp), bounds();
        }
      }
      if (maxPx === 0) errs.push("아무것도 그리지 않습니다");
      if (spill > 0) notes.push(`${W}x${H} 캔버스 밖에 ${spill} px이 그려집니다 (그리기 범위: x ${bx0}..${bx1}, y ${by0}..${by1}). 크기를 늘리거나 원점을 옮기세요`);
      if (spillLight > 60) notes.push(`발광이 캔버스 밖으로 ${spillLight} px 넘칩니다`);
      // one-shots end clean
      if (!meta.loop) {
        drawAt(fx, meta.duration, frame, opts);
        const left = count(frame.color, (c, j) => c >>> 24 && inside(j));
        if (left > 0) notes.push(`t = duration에서 ${left} px이 남아 있습니다. 일회성 이펙트는 빈 화면으로 끝나야 합니다`);
      }
      // loops have no seam: stepping from the last frame back to the first changes no more than a normal step
      if (meta.loop) {
        const shots: Uint32Array[] = [];
        for (let i = 0; i < n; i++) {
          drawAt(fx, (i / n) * meta.duration, frame, opts);
          shots.push(frame.color.slice());
        }
        const step = (a: Uint32Array, b: Uint32Array) => count(a, (c, j) => c !== b[j]);
        const diffs = shots.slice(0, -1).map((a, i) => step(a, shots[i + 1])).sort((x, y) => x - y);
        const typical = diffs[Math.floor(diffs.length * 0.9)] ?? 0, seam = step(shots[n - 1], shots[0]);
        if (seam > Math.max(typical * 2, 12)) notes.push(`반복 경계: 마지막 프레임과 첫 프레임 사이에 ${seam} px이 바뀝니다 (일반 스텝은 ${typical} px)`);
      }
      // any palette works: a short one (resampled by resolveOptions, as createFx does) leaves no holes
      let holes = 0;
      const put = Painter.prototype.put;
      Painter.prototype.put = function (sx: number, sy: number, c: number, a: number) {
        if (typeof c !== "number" || c !== c) holes++;
        return put.call(this, sx, sy, c, a);
      };
      try {
        const short = resolveOptions(meta, { palette: ["#141024", "#5a3c8c", "#c8a0f0", "#ffffff"] });
        for (let i = 0; i <= 8; i++) drawAt(fx, (i / 8) * meta.duration * (meta.loop ? 0.999 : 1), frame, short);
      } finally {
        Painter.prototype.put = put;
      }
      if (holes) errs.push(`4단계 팔레트를 사용했을 때 ${holes}개 픽셀이 정의되지 않은 색으로 그려집니다. fit(o.palette, n)을 사용하세요`);
      // deterministic: the same t twice gives the same frame
      const tt = meta.duration * 0.37;
      drawAt(fx, tt, frame, opts);
      const once = frame.color.slice();
      drawAt(fx, tt, frame, opts);
      if (count(once, (c, j) => c !== frame.color[j]) > 0) errs.push("결정적이지 않습니다. 같은 t에서 서로 다른 프레임이 그려졌습니다");
      ms.sort((x, y) => x - y);
      const med = ms[ms.length >> 1];
      if (med > 4) notes.push(`느림: 프레임당 ${med.toFixed(1)} ms`);
    } else {
      // a simulation: step it in order, as a game would, and check every frame
      const run = (seed: number) => {
        const inst = createFx(mod, { x: meta.origin[0], y: meta.origin[1], ...opts, seed });
        const shots: Uint32Array[] = [];
        for (let i = 0; i <= n; i++) {
          if (i) inst.update(1 / meta.fps);
          clearFrame(frame);
          const t0 = performance.now();
          inst.draw(frame);
          ms.push(performance.now() - t0);
          shots.push(frame.color.slice());
          maxPx = Math.max(maxPx, count(frame.color, (c, j) => c >>> 24 && inside(j)), count(frame.light, (c, j) => (c & 0xffffff) && inside(j)));
          const sp = count(frame.color, (c, j) => c >>> 24 && !inside(j));
          spill = Math.max(spill, sp);
          bounds(); // Report the full animation extent, not only the frame with the most spilled pixels.
          spillLight = Math.max(spillLight, count(frame.light, (c, j) => (c & 255) + ((c >>> 8) & 255) + ((c >>> 16) & 255) > 90 && !inside(j)));
        }
        return shots;
      };
      const a = run(opts.seed), b = run(opts.seed);
      for (const seed of [2, 3, 7]) run(seed);
      if (maxPx === 0) errs.push("아무것도 그리지 않습니다");
      if (spill > 0) notes.push(`${W}x${H} 캔버스 밖에 ${spill} px이 그려집니다 (그리기 범위: x ${bx0}..${bx1}, y ${by0}..${by1}). 크기를 늘리거나 원점을 옮기세요`);
      if (spillLight > 60) notes.push(`발광이 캔버스 밖으로 ${spillLight} px 넘칩니다`);
      if (a.some((s, i) => count(s, (c, j) => c !== b[i][j]) > 0)) errs.push("결정적이지 않습니다. 같은 seed로 두 번 실행한 결과가 다릅니다");
      if (!meta.loop) {
        const left = count(a[a.length - 1], (c, j) => c >>> 24 && inside(j));
        if (left > 0) notes.push(`t = duration에서 ${left} px이 남아 있습니다. 일회성 이펙트는 빈 화면으로 끝나야 합니다`);
      }
      ms.sort((x, y) => x - y);
      if (ms[ms.length >> 1] > 4) notes.push(`느림: 프레임당 ${ms[ms.length >> 1].toFixed(1)} ms`);
    }
  } catch (e) {
    errs.push(String(e instanceof Error ? e.message : e).split("\n")[0]);
  }
  if (errs.length) fails++;
  if (notes.length) warns++;
  const tag = errs.length ? "실패" : notes.length ? "경고" : "통과";
  if (errs.length || notes.length || ids.length < 40) console.log(`${tag}  ${id}${[...errs, ...notes].map((s) => "\n      " + s).join("")}`);
}
console.log(`\n이펙트 ${ids.length}개: 통과 ${ids.length - fails}개, 실패 ${fails}개, 경고 ${warns}개`);
process.exit(fails ? 1 : 0);
