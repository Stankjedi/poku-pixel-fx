#!/usr/bin/env node
// Start a new effect from a template: node build-tools/tools/new.mjs <category>/<name> [--loop]
// Writes TypeScript source and registers it for the next build.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { FX_DIR, effectSymbol } from "./lib/fxlib.mjs";
const { categories } = await import(new URL("../../build/fx/categories.js", import.meta.url).href);

const id = process.argv[2], loop = process.argv.includes("--loop");
if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) {
  console.error("사용법: node build-tools/tools/new.mjs <category>/<name> [--loop]   (kebab-case)");
  process.exit(1);
}
const file = join(FX_DIR, id + ".ts"), legacyFile = join(FX_DIR, id + ".js");
if (existsSync(file) || existsSync(legacyFile)) {
  console.error(`${file} 파일이 이미 있습니다`);
  process.exit(1);
}
const category = id.split("/")[0];
if (!categories.some((c: { id: string }) => c.id === category)) {
  console.error(`알 수 없는 갤러리 카테고리: ${category}. 기존 카테고리를 선택하세요.`);
  process.exit(1);
}
const registryFile = join(FX_DIR, "index.ts");
const registry = readFileSync(registryFile, "utf8");
const symbol = effectSymbol(id);
const exportMarker = "export const effects = {";
const categoryMarker = 'export { categories } from "./categories.js";';
if (!registry.includes(exportMarker) || !registry.includes(categoryMarker) || registry.includes(`"${id}":`) || registry.includes(`import * as ${symbol} `)) {
  console.error("이펙트를 안전하게 등록할 수 없습니다. 레지스트리의 마커가 없거나 이미 같은 이펙트가 있습니다.");
  process.exit(1);
}
const updatedRegistry = registry
  .replace(categoryMarker, `import * as ${symbol} from "./${id}.js";\n${categoryMarker}`)
  .replace(exportMarker, `${exportMarker}\n  "${id}": ${symbol},`);
const name = id.split("/")[1].replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase());
const body = loop
  ? `  // Seekable curved trails with soft birth/death; the core remains deliberately pixel-stepped.
  const C = fit(o.palette, 7), phase = t / meta.duration;
  cycle(t, meta.duration, 12, o.seed, 0.8, (age, life, r) => {
    const base = r.range(0, TAU);
    const position = (dt: number): [number, number] => {
      const angle = base + (t - age + dt) / meta.duration * TAU, radius = 9 + dt / life * 13;
      return [Math.cos(angle) * radius, Math.sin(angle) * radius - 12];
    };
    drawTrail(p, motionTrail(position, age, 0.07), { color: C[3], head: C[5],
      alpha: particleEnvelope(age, life, 0.12, 0.4), light: 0.1 });
  });
  p.circle(0, -12, 4 + Math.sin(phase * TAU) * 0.7, C[3]);
  p.circle(-1, -13, 2.2, C[5]);
  p.glow(0, -12, 14, C[4], 0.22);`
  : `  // Starter, not a finished effect: compare its silhouette and timing to your chosen reference.
  if (t >= meta.duration) return;
  const C = fit(o.palette, 7);
  const flash = 1 - smooth(0, 0.07, t);
  if (flash > 0) {
    const rim = pointedRibbon(-19, 19, 8 * flash, 3 * flash);
    p.poly(rim.shape, C[4], flash);
    p.path(rim.top, C[6], flash);
    sparkle(p, 0, -1, 5 * flash, C[6], C[4], flash);
  }
  burst(14, o.seed, (r, i) => {
    // Stratification avoids accidental clusters; only the hottest head uses the bright ramp step.
    const angle = (i + 0.5 + r.range(-0.32, 0.32)) / 14 * TAU;
    const speed = r.range(60, 150), life = r.range(0.22, 0.5);
    const alpha = particleEnvelope(t, life, 0.035, 0.25);
    if (alpha <= 0) return;
    const position = (age: number): [number, number] => fly(0, -1, Math.cos(angle) * speed, Math.sin(angle) * speed, age, 90, 5.5);
    drawTrail(p, motionTrail(position, t, 0.055), { color: C[3], head: t / life < 0.35 ? C[6] : C[5], alpha, light: 0.12 });
  });
  p.glow(0, -1, 18, C[4], 0.28 * flash);`;
const src = `import { PAL, fit, ${loop ? "cycle" : "burst, fly, smooth, pointedRibbon, sparkle"}, motionTrail, drawTrail, particleEnvelope, TAU } from "../../core/index.js";

export const meta = {
  addedAt: "${new Date().toISOString()}",
  name: "${name}",
  desc: "${loop ? "Layered pulse with softly tapered orbiting trails." : "A pointed flash releases a sparse fan of bright-headed, fading sparks."}",
  tags: ["${id.split("/")[0]}"],
  size: [96, 80],
  origin: [48, 48],
  duration: ${loop ? 1.2 : 0.7},
  loop: ${loop},
  fps: 30,
  bg: "dark",
  options: { palette: PAL.arcane, seed: 1 },
};

export function draw(p: import("../../core/painter.js").Painter, t: number, o: typeof meta.options) {
${body}
}
`;
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, src, { flag: "wx" });
try { writeFileSync(registryFile, updatedRegistry); }
catch (error) { unlinkSync(file); throw error; }
console.log(`${file} 생성 완료\n다음: npm run build && node build-tools/tools/render.mjs ${id} 실행 후 records/${id}/contact.png 확인\n완성 전 docs/QUALITY.md 기준으로 원본 크기와 실제 속도를 확인하세요.\n캐릭터가 있으면 동작을 추가하세요: docs/AUTHORING.md의 "Acts"를 참고하고 node build-tools/tools/act.mjs ${id} 실행`);
