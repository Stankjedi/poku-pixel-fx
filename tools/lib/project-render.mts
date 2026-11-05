/** One resolved project feeds rendering, inspection, sharing and asset export. */
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join, relative, resolve, sep } from "node:path";
import type { ResolvedProject } from "../../src/authoring/project.js";
import { ROOT, WORKSPACE, loadEffect, renderSequence, renderActSequence, type EffectData, type RenderOptions, type RenderSequence } from "./fxlib.mjs";
import { scene3D } from "./scene3d.mjs";
const { parseProject, resolveProject, serializeProject } = await import(new URL("../../../build/authoring/project.js", import.meta.url).href);
const { validateIntentBrief, readIntentBrief } = await import(new URL("../../../tools/lib/effect-intent.mjs", import.meta.url).href);

export const projectDigest = (project: ResolvedProject) => createHash("sha256").update(serializeProject(project)).digest("hex");
export function readProjectFile(file: string, overrides: Partial<ResolvedProject> = {}): ResolvedProject {
  const project = parseProject(readFileSync(file, "utf8"));
  return resolveProject({ ...project, ...overrides, options: { ...project.options, ...overrides.options } });
}
export function projectRenderOptions(project: ResolvedProject): RenderOptions {
  return { fps: project.fps, seed: project.seed, options: { ...project.options, layers: project.layers }, bg: project.bg,
    actor: project.actor, target: project.target, seconds: project.seconds, hold: project.hold,
    margin: project.margin, pad: project.pad, cameraMotion: project.cameraMotion,
    ...(project.pixelStyle?.edgeFade !== undefined ? { edgeFade: project.pixelStyle.edgeFade } : {}) };
}
/** Explicit project-relative paths win. Studio's canonical authoring path may resolve in its caller workspace. */
export function resolveProjectIntentFile(project: ResolvedProject, projectFile: string): string {
  const authored = `authoring/${project.id}.intent.json`;
  if (project.intentRef) {
    const adjacent = resolve(dirname(projectFile), project.intentRef);
    if (existsSync(adjacent)) return adjacent;
    if (project.intentRef.replaceAll("\\", "/").replace(/^\.\//, "") !== authored) return adjacent;
  }
  for (const root of [WORKSPACE, ROOT]) {
    const file = join(root, authored);
    if (existsSync(file)) return file;
  }
  return project.intentRef ? resolve(dirname(projectFile), project.intentRef) : join(WORKSPACE, authored);
}
export function readProjectIntent(project: ResolvedProject, projectFile: string) {
  const brief = validateIntentBrief(JSON.parse(readFileSync(resolveProjectIntentFile(project, projectFile), "utf8")), project.id);
  const hash = createHash("sha256").update(JSON.stringify(brief)).digest("hex");
  if (project.intentSha256 && project.intentSha256 !== hash) throw new Error("Project intentSha256 differs from its intent brief");
  return brief;
}

export async function renderProject(project: ResolvedProject, capture: Pick<RenderOptions, "layers" | "diagnostics"> = {}) {
  let fx: EffectData, sequence: RenderSequence;
  const { postprocessProjectFrame, finishProjectRGBA } = await import(new URL("../../../build/authoring/edits.js", import.meta.url).href);
  const { compositeProjectFrame } = await import(new URL("../../../build/authoring/composite.js", import.meta.url).href);
  const options: RenderOptions = { ...projectRenderOptions(project), ...capture,
    postprocess: (frame, time, index, context) => postprocessProjectFrame(frame, project, time, index, context),
    finalizeRGBA: rgba => finishProjectRGBA(rgba, project), hdr: true, assetActor: project.actor,
    compose: (frame, rgba, background) => { compositeProjectFrame(frame, rgba, project, background); return rgba; } };
  if (project.kind === "3d") {
    const name = project.renderProfile?.effectId ?? project.options.effectId ?? project.id.split("/")[1];
    const flags: Record<string, string> = { fps: String(project.fps), seed: String(project.seed), opts: JSON.stringify(options.options),
      cinematic: "true", background: project.renderProfile?.background ?? "none",
      grid: String(project.renderProfile?.grid ?? false), "camera-motion": String(project.renderProfile?.cameraMotion ?? false),
      ...(project.renderProfile ? { "profile-json": JSON.stringify(project.renderProfile) } : {}),
      ...(project.seconds !== undefined ? { frames: String(Math.max(1, Math.round(project.seconds * project.fps) + 1)) } : {}) };
    const run = await scene3D(name, flags, "atlas", options); fx = { ...run.effect, id: project.id }; sequence = run.sequence;
  } else {
    if (project.kind === "recipe") {
      const { createRecipeEffect } = await import(new URL("../../../build/authoring/recipes.js", import.meta.url).href);
      const mod = createRecipeEffect(project.recipe);
      fx = { id: project.id, file: "", mod, meta: mod.meta };
    } else if (project.kind === "character") {
      const { createCharacterEffect } = await import(new URL("../../../build/authoring/character-effect.js", import.meta.url).href);
      const mod = createCharacterEffect(project.character, project.options.clip, project.fps);
      fx = { id: project.id, file: "", mod, meta: mod.meta };
    } else fx = await loadEffect(project.id);
    sequence = project.kind === "act" ? renderActSequence(fx, options) : renderSequence(fx, options);
  }
  // Bind the complete resolved selection, not just a seed or an effect id.
  const projectJSON = serializeProject(project), variant = projectDigest(project);
  sequence = { ...sequence, settings: { ...sequence.settings, project, projectSha256: variant } };
  const source = fx.file ? readFileSync(fx.file, "utf8") : projectJSON;
  const context = { kind: project.kind, projectSha256: variant,
    effectDuration: fx.meta.duration, effectLoop: !!fx.meta.loop,
    source: fx.file ? relative(ROOT, fx.file).split(sep).join("/") : "project.json" };
  return { project, projectJSON, variant, fx, sequence, source, context };
}
