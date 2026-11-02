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
  ? `  // a loop: everything is a function of the phase, so t = 0 and t = duration match
  const C = ramp(o.palette), ph = t / meta.duration;
  cycle(t, meta.duration, 12, o.seed, 0.8, (age, life, r) => {
    const k = age / life, a = r.range(0, TAU) + ph * TAU, rad = 6 + k * 12;
    p.px(Math.cos(a) * rad, Math.sin(a) * rad - 8, at(C.slice(2), 1 - k));
  });
  p.circle(0, -8, 4 + Math.sin(ph * TAU) * 1.5, C[5]);
  p.glow(0, -8, 20, C[4], 0.35);`
  : `  // a one-shot: a hero frame, then everything falls away and is gone by t = duration
  const C = ramp(o.palette);
  if (t < 0.06) p.circle(0, -8, 6, WHITE);
  burst(14, o.seed, (r) => {
    const a = r.range(0, TAU), sp = r.range(40, 90), life = r.range(0.3, 0.6);
    if (t > life) return;
    const [x, y] = fly(0, -8, Math.cos(a) * sp, Math.sin(a) * sp, t, 120, 2);
    p.px(x, y, at(C.slice(2), 1 - t / life));
    p.light(x, y, C[4], 0.5 * (1 - t / life));
  });
  p.glow(0, -8, 24, C[4], 0.5 * (1 - seg(t, 0, 0.4)));`;
const src = `import { PAL, ramp, at, ${loop ? "cycle" : "burst, fly, seg, WHITE"}, TAU } from "../../core/index.js";

export const meta = {
  addedAt: "${new Date().toISOString()}",
  name: "${name}",
  desc: "One line: what it is, how it moves.",
  tags: ["${id.split("/")[0]}"],
  size: [48, 48],
  origin: [24, 32],
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
console.log(`${file} 생성 완료\n다음: npm run build && node build-tools/tools/render.mjs ${id} 실행 후 records/${id}/contact.png 확인\n캐릭터가 있으면 동작을 추가하세요: docs/AUTHORING.md의 "Acts"를 참고하고 node build-tools/tools/act.mjs ${id} 실행`);
