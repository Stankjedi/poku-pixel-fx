#!/usr/bin/env node
// Start a new effect from a template: node build-tools/tools/new.mjs <category>/<name> [--cinematic --loop]
// Writes TypeScript source and registers it for the next build.

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import { ROOT, WORKSPACE, FX_DIR, effectSymbol } from "./lib/fxlib.mjs";
import { timingTemplate } from "./lib/timing-template.mjs";
import { cinematicTemplate } from "./lib/cinematic-template.mjs";
import { meaningTemplate } from "./lib/meaning-template.mjs";
import { parseGenerationStyle2D, generationRenderOptions2D, generationStyleFlags } from './lib/generation-style.mjs';
import { parseGenerationControls2D } from "./lib/generation-controls.mjs";
const { parseGenerationMeaning2D, createGenerationPlan2D } = await import(new URL("../../build/authoring/generation.js", import.meta.url).href);
const { createGenerationStarter2D } = await import(new URL("../../build/authoring/generation-starter.js", import.meta.url).href);
const { createIntentBrief } = await import(new URL("../../tools/lib/effect-intent.mjs", import.meta.url).href);
const { categories } = await import(new URL("../../build/fx/categories.js", import.meta.url).href);

const id = process.argv[2], loop = process.argv.includes("--loop"), timing = process.argv.includes("--timing");
const minimal = process.argv.includes("--minimal"), cinematic = process.argv.includes("--cinematic");
const words: Record<string, string> = {}, controls: Record<string, string> = {}, styles: Record<string, string> = {}, unknown: string[] = [];
for (let i = 3; i < process.argv.length; i++) {
  const flag = process.argv[i];
  if (["--material", "--action", "--response", "--seed", "--distance", "--travel", ...generationStyleFlags].includes(flag)) {
    const values = (generationStyleFlags as readonly string[]).includes(flag) ? styles : ["--seed", "--distance", "--travel"].includes(flag) ? controls : words;
    if (values[flag] !== undefined || !process.argv[i + 1] || process.argv[i + 1].startsWith("--")) unknown.push(flag);
    else values[flag] = process.argv[++i];
  } else if (!["--loop", "--timing", "--minimal", "--cinematic"].includes(flag)) unknown.push(flag);
}
const semantic = Object.keys(words).length > 0, controlled = Object.keys(controls).length > 0, styled = Object.keys(styles).length > 0;
if (unknown.length || (minimal && (timing || process.argv.includes("--cinematic")))
  || (timing && process.argv.includes("--cinematic")) || ((semantic || controlled || styled) && (loop || minimal || timing || cinematic))) {
  console.error("알 수 없거나 충돌하는 생성 옵션입니다. 의미 생성과 --seed/--distance/--travel/--fire-sparks/--fire-spark-count/--fire-spark-light/--fire-spark-finish는 --loop/--timing/--minimal/--cinematic과 함께 쓰지 않습니다."); process.exit(1);
}
if (loop && timing) { console.error("--timing은 one-shot 시간 곡선 예제입니다. --loop와 함께 사용할 수 없습니다."); process.exit(1); }
if (!id || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(id)) {
  console.error("사용법: node build-tools/tools/new.mjs <category>/<name> [--cinematic --loop | --timing | --minimal]\nfire/ice/scifi/water/lightning 기본값은 명시된 재질 시작 예제입니다. --cinematic은 범용 소스 초안을 선택합니다.\n의미 생성: --material fire|energy --action dash|burst|plume 또는 --material ice --action shatter 또는 --material water --action pour 또는 --material lightning --action strike [--response burst|dissipate] (한국어 별칭 지원)\n생성 계획: [--seed 0..4294967295] [--distance 24..160 --travel 0.25..3] (거리 px·이동 시간 s는 dash만 지원, 생략 시 기존 기본값 유지)\n불티 선택: [--fire-sparks short-exposure [--fire-spark-count 0..720] [--fire-spark-light 0..2] [--fire-spark-finish scintillation]] (fire burst·plume 또는 dash만 지원, 생략 시 기존 결과 유지)\n돌진+폭발 짧은 불티: 기본 합계 410 (이동 240 + 폭발 170). 명시적 N은 이동 round(N*240/410) + 나머지, N=1은 폭발 불티 없음. 광원 대상 합계 최대 24.");
  process.exit(1);
}
let plan: import("../src/authoring/generation.js").GenerationPlan2D | undefined;
let requested: ReturnType<typeof parseGenerationControls2D>;
let selectedStyle: ReturnType<typeof parseGenerationStyle2D>;
try {
  requested = parseGenerationControls2D(controls);
  selectedStyle = parseGenerationStyle2D(styles);
  if (semantic) plan = createGenerationPlan2D({ ...parseGenerationMeaning2D(words['--material'], words['--action'], words['--response']), ...requested });
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
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
// A declared category example, never an interpretation of the requested effect name.
const starter = !semantic && !minimal && !timing && !cinematic ? createGenerationStarter2D(category) : undefined;
if (starter) {
  if (loop) {
    console.error(`${category}의 재질 시작 예제는 one-shot입니다. 재질 루프는 아직 지원하지 않습니다. 범용 팔레트 루프를 원할 때만 --cinematic --loop를 명시하세요. 파일은 생성하지 않았습니다.`);
    process.exit(1);
  }
  try { plan = controlled ? createGenerationPlan2D({ ...starter.plan.intent, ...requested }) : starter.plan; }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
}
if ((controlled || styled) && !plan) {
  console.error("--seed/--distance/--travel/--fire-sparks/--fire-spark-count/--fire-spark-light/--fire-spark-finish는 명시된 재질 시작 예제 또는 --material/--action 생성 계획에만 사용할 수 있습니다. 일반 템플릿은 지원하지 않습니다.");
  process.exit(1);
}
// Validate a style/action conflict before any intent, source, plan or registry write.
try { if (plan) generationRenderOptions2D(plan, selectedStyle); }
catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
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
const planFile = join(WORKSPACE, 'authoring', id + '.generation.json');
if (plan && existsSync(planFile)) { console.error(`${planFile} 생성 계획이 이미 있습니다. 기존 계획은 덮어쓰지 않습니다.`); process.exit(1); }
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
const compactArcane = category === "arcane" && !loop && !cinematic && !minimal && !timing && !plan;
const src = plan ? (starter ? `// Category example: ${starter.label}. This does not interpret the effect name.\n` : '')
  + meaningTemplate(name, category, plan, undefined, selectedStyle) : timing ? timingTemplate(name, category) : !minimal ? cinematicTemplate(name, category, loop, undefined, compactArcane ? "volume" : "ribbon") : `import { PAL, fit, ${loop ? "cycle" : "burst, fly, smooth, pointedRibbon, sparkle"}, motionTrail, drawTrail, particleEnvelope, TAU } from "../../core/index.js";

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
const intent = createIntentBrief(ROOT, id);
mkdirSync(dirname(file), { recursive: true });
writeFileSync(file, src, { flag: "wx" });
let wrotePlan = false;
try {
  if (plan) { mkdirSync(dirname(planFile), { recursive: true }); writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n', { flag: 'wx' }); wrotePlan = true; }
  writeFileSync(registryFile, updatedRegistry);
} catch (error) { unlinkSync(file); if (wrotePlan) unlinkSync(planFile); throw error; }
console.log(`${file} 생성 완료\n의도서: ${intent.path} (${intent.created ? "새 빈 초안" : "기존 내용 유지"})\n먼저 docs/EFFECT_INTENT.md에 따라 의미·힘·인과·종료와 실제 duration/loop를 작성하고 node tools/effect-intent.mjs validate ${id} 실행\n다음: npm run build && node build-tools/tools/render.mjs ${id} 실행 후 records/${id}/contact.png 확인\n완성 전 docs/QUALITY.md 기준으로 원본 크기와 실제 속도를 확인하세요.\n캐릭터가 있으면 동작을 추가하세요: docs/AUTHORING.md의 "Acts"를 참고하고 node build-tools/tools/act.mjs ${id} 실행`);

if (starter) console.log(`카테고리 시작 예제: ${starter.category} → ${starter.label}. 요청한 이름의 의미를 해석한 결과가 아닙니다. 다른 동작은 --material/--action으로 지정하고, 범용 소스 초안은 --cinematic을 사용하세요.`);
if (plan) console.log(`생성 계획: ${planFile}\n${plan.intent.material} / ${plan.intent.action} / ${plan.intent.response}\n방출 ${plan.timing.release}s → 도착 ${plan.timing.arrival}s → 종료 ${plan.timing.end}s. 계획은 의도 초안이며 시각 검토나 승인 기록이 아닙니다.`);
else if (timing) console.log("시간 곡선 제작 안내: docs/TIMING_CURVES.md. 이동·두께·투명도·광원을 따로 조정하고 마지막 구간을 확인하세요.");
else if (compactArcane) console.log("arcane 기본 one-shot은 기존 짧은 부피 입자를 사용하는 발광 소스 초안입니다. 이름의 의미를 해석하지 않습니다. --cinematic과 --loop는 기존 리본 방식을 유지합니다. docs/GENERATION_QUALITY.md 참고.");
else if (!minimal) console.log("일반 생성은 경로를 따라 변형·회전하는 발광 소스 초안입니다. 카테고리는 팔레트만 고르며 실제 재질이나 피사체를 해석하지 않습니다. 화염/에너지/얼음/물의 지원 동작은 --material과 --action을 지정하세요. docs/GENERATION_QUALITY.md 참고. --minimal은 기존의 작은 학습용 초안입니다.");

if (styled) console.log("불티 선택: short-exposure. 기존 이펙트나 기본 생성 방식을 바꾸지 않는 명시적 선택입니다.");
