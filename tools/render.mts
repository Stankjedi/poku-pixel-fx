#!/usr/bin/env node
// Deterministic effect assets and previews, streamed once to all requested outputs.
// --sheet: transparent composite PNG + JSON. --layers: color PNG + linear RGB .f32 + JSON.
// --gif / --mp4: preview with backdrop and stand-in actor. --edge-fade 0 disables asset edge finishing.
import { join } from "node:path";
import { ROOT, resolveIds, loadEffect, renderSequence, createContactSheet, createSpriteSheet, writeVideos, save } from "./lib/fxlib.mjs";
import { createLayerSheet } from "./lib/layers.mjs";

async function main() {
  const args = process.argv.slice(2), flags: Record<string, string> = {}, patterns: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith("--")) patterns.push(a);
    else if (["gif", "mp4", "sheet", "layers", "all", "no-actor"].includes(a.slice(2))) flags[a.slice(2)] = "true";
    else {
      if (args[i + 1] === undefined || args[i + 1].startsWith("--")) throw new Error(`${a} 값이 필요합니다`);
      flags[a.slice(2)] = args[++i];
    }
  }
  if (!patterns.length) throw new Error("사용법: render <id|category|pattern>... [--gif] [--mp4] [--sheet] [--layers] [--all]");
  const ids = resolveIds(patterns, undefined, { strict: true });
  if (!ids.length) throw new Error("내보낼 이펙트가 없습니다");
  const out = flags.out ?? join(ROOT, "records");
  let failed = 0;
  for (const id of ids) {
    let layers: ReturnType<typeof createLayerSheet> | undefined;
    try {
      const fx = await loadEffect(id), r = renderSequence(fx, {
        fps: flags.fps ? +flags.fps : undefined, seed: flags.seed ? +flags.seed : undefined,
        bg: flags.bg, margin: flags.margin ? +flags.margin : undefined,
        actor: flags["no-actor"] ? false : undefined, layers: !!flags.layers,
        edgeFade: flags["edge-fade"] === "false" ? false : flags["edge-fade"] !== undefined ? +flags["edge-fade"] : undefined,
        options: flags.opts ? JSON.parse(flags.opts) : undefined,
      });
      const dir = join(out, id), name = id.split("/")[1], made: string[] = [];
      const contact = createContactSheet(fx, r, { max: flags.all ? r.n : +(flags.max ?? 16), zoom: flags.zoom ? +flags.zoom : undefined });
      const sheet = flags.sheet ? createSpriteSheet(fx, r, name) : undefined;
      if (flags.layers) layers = createLayerSheet(join(dir, name), fx, r);
      const k = +(flags.scale ?? Math.max(2, Math.min(8, Math.floor(480 / Math.max(r.w, r.h)))));
      const loops = +(flags.loops ?? (fx.meta.loop ? 2 : 1));
      const videos = [
        ...(flags.gif ? [{ file: join(dir, "anim.gif"), scale: k, loops }] : []),
        ...(flags.mp4 ? [{ file: join(dir, "anim.mp4"), scale: k, loops: Math.max(loops, fx.meta.loop ? 3 : 1) }] : []),
      ];
      function* frames() {
        let i = 0;
        for (const f of r.frames) { contact.push(f, i); sheet?.push(f, i); layers?.push(f, i); i++; yield f; }
      }
      if (videos.length) {
        if (!writeVideos(videos, { ...r, frames: frames() })) throw new Error("요청한 영상을 생성할 수 없습니다: ffmpeg가 PATH에 없습니다");
        made.push(...videos.map(v => v.file));
      } else for (const _ of frames()) { /* all sinks consume each frame immediately */ }
      made.push(save(join(dir, "contact.png"), contact.png()));
      if (sheet) {
        const s = sheet.result();
        made.push(save(join(dir, `${name}.png`), s.png), save(join(dir, `${name}.json`), JSON.stringify(s.json, null, 1)));
      }
      if (layers) made.push(...layers.finish());
      console.log(`${id}  ${r.n}프레임  ->  ${made.join("  ")}`);
    } catch (error) {
      failed++; console.error(`${id}  실패: ${error instanceof Error ? error.message : error}`);
    } finally { layers?.abort(); }
  }
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
