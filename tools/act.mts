#!/usr/bin/env node
// Acted scenes: native actor, effect, contacts and hit-stop share one deterministic export timeline.
// --sheet [--layers] exports transparent assets. --gif / --mp4 exports the preview.
// --actor human|cat|fox|owl|dragon --height N --motion act|idle|walk|guard|crouch|wave|trot|fly --weapon auto|none|sword|bow
import { basename, join } from "node:path";
import { ROOT, WORKSPACE, resolveIds, loadEffect, renderActSequence, createSpriteSheet, canvas, upscale, save, writeVideos, type FrameData } from "./lib/fxlib.mjs";
import { createLayerSheet } from "./lib/layers.mjs";
import { createAssetBundle } from "./lib/asset-bundle.mjs";

function actorOptions(flags: Record<string, string>, options: Record<string, any>) {
  if (!["actor", "height", "motion", "weapon", "attachment"].some(key => flags[key] !== undefined)) return options;
  const prior = options.actorSelection ?? {}, value = flags.actor ?? (prior.kind === "creature" ? prior.species : "human");
  if (!["human", "cat", "fox", "owl", "dragon"].includes(value)) throw new Error("actor는 human, cat, fox, owl, dragon 중 하나여야 합니다");
  const selection = { ...prior, kind: value === "human" ? "human" : "creature", ...(value === "human" ? {} : { species: value }) };
  if (flags.height !== undefined) {
    const height = +flags.height;
    if (!Number.isSafeInteger(height) || height < 1) throw new RangeError("height must be a positive integer");
    selection.height = height;
  }
  for (const [key, allowed] of [
    ["motion", ["act", "idle", "walk", "guard", "crouch", "wave", "trot", "fly"]], ["weapon", ["auto", "none", "sword", "bow"]],
    ["attachment", ["auto", "root", "hand", "head", "chest"]],
  ] as const) {
    if (flags[key] !== undefined) {
      if (!(allowed as readonly string[]).includes(flags[key])) throw new RangeError(`${key}: ${allowed.join(", ")}`);
      selection[key] = flags[key];
    }
  }
  return { ...options, actorSelection: selection };
}

async function main() {
  const args = process.argv.slice(2), flags: Record<string, string> = {}, patterns: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (["--mp4", "--gif", "--no-target", "--no-actor", "--sheet", "--layers", "--bundle", "--trim", "--deduplicate"].includes(args[i])) flags[args[i].slice(2)] = "true";
    else if (args[i].startsWith("--")) {
      if (args[i + 1] === undefined || args[i + 1].startsWith("--")) throw new Error(`${args[i]} 값이 필요합니다`);
      flags[args[i].slice(2)] = args[++i];
    } else patterns.push(args[i]);
  }
  if (!patterns.length) throw new Error("사용법: act <id|pattern> [--sheet] [--layers] [--bundle] [--mp4] [--actor human]");
  const ids = resolveIds(patterns, undefined, { strict: true });
  if (!ids.length) throw new Error("내보낼 이펙트가 없습니다");
  const options = actorOptions(flags, flags.opts ? JSON.parse(flags.opts) : {});
  let failed = 0;
  for (const id of ids) {
    let layers: ReturnType<typeof createLayerSheet> | undefined;
    let bundle: ReturnType<typeof createAssetBundle> | undefined;
    try {
      const fx = await loadEffect(id), r = renderActSequence(fx, {
        fps: flags.fps ? +flags.fps : flags.sheet || flags.bundle ? fx.meta.fps : 60,
        bg: flags.bg ?? ((flags.sheet || flags.bundle) && !flags.mp4 && !flags.gif ? "none" : undefined),
        actor: !flags["no-actor"], target: !flags["no-target"],
        seconds: flags.seconds ? +flags.seconds : undefined,
        hold: flags.hold !== undefined ? +flags.hold : flags.sheet || flags.bundle ? 0 : undefined,
        seed: flags.seed !== undefined ? +flags.seed : undefined,
        layers: !!flags.layers || !!flags.bundle, options,
      });
      const name = id.split("/")[1], base = flags.out
        ? flags.out.replace(/\.(?:png|gif|mp4|json)$/i, "").replace(/\.sheet$/i, "")
        : join(WORKSPACE, "records", "act", id.replace("/", "-"));
      const sheetFile = base + ".sheet.png";
      const assetInfo = { ...r, settings: { ...r.settings, background: "transparent", cameraMotion: false } };
      const sheet = flags.sheet ? createSpriteSheet(fx, assetInfo, name, basename(sheetFile)) : undefined;
      if (flags.layers) layers = createLayerSheet(base, fx, assetInfo);
      if (flags.bundle) bundle = createAssetBundle(base, fx, assetInfo, {
        maxTextureSize: flags["max-texture"] !== undefined ? +flags["max-texture"] : undefined,
        padding: flags.padding !== undefined ? +flags.padding : undefined,
        trim: !!flags.trim, deduplicate: !!flags.deduplicate,
      });
      const k = +(flags.zoom ?? Math.max(2, Math.min(8, Math.floor(960 / Math.max(r.w, r.h)))));
      const videos = [
        ...(flags.gif ? [{ file: base + ".gif", scale: k }] : []),
        ...(flags.mp4 ? [{ file: base + ".mp4", scale: k }] : []),
      ];
      const list: FrameData[] = [], wantStrip = !flags.sheet && !flags.bundle && !videos.length;
      const step = +(flags.step ?? 1 / 12), from = flags.from !== undefined ? +flags.from : undefined,
        to = flags.to !== undefined ? +flags.to : Infinity;
      if (!Number.isFinite(step) || step <= 0 || (from !== undefined && !Number.isFinite(from)) || Number.isNaN(to))
        throw new RangeError("Strip range and step are invalid");
      let start = from;
      function* frames() {
        let i = 0;
        for (const f of r.frames) {
          sheet?.push(f, i); layers?.push(f, i); bundle?.push(f, i); i++;
          if (wantStrip) {
            start ??= f.t;
            if (f.t >= start - 1e-6 && f.t <= to + 1e-6 && f.t + 1e-6 >= start + list.length * step) list.push(f);
          }
          yield f;
        }
      }
      if (videos.length) {
        if (!writeVideos(videos, { ...r, frames: frames() })) throw new Error("요청한 영상을 생성할 수 없습니다: ffmpeg가 PATH에 없습니다");
      } else for (const _ of frames()) { /* output sinks consume one frame at a time */ }
      const made = videos.map(v => v.file);
      if (sheet) {
        const s = sheet.result();
        made.push(save(sheetFile, s.png), save(base + ".sheet.json", JSON.stringify(s.json, null, 1)));
      }
      if (layers) made.push(...layers.finish());
      if (bundle) made.push(...bundle.finish().files);
      if (wantStrip) {
        if (!list.length) throw new Error("지정한 시간 범위에 프레임이 없습니다");
        const zoom = +(flags.zoom ?? 3), cols = +(flags.cols ?? 8);
        if (!Number.isSafeInteger(zoom) || zoom < 1 || !Number.isSafeInteger(cols) || cols < 1) throw new RangeError("zoom and cols must be positive integers");
        const rows = Math.ceil(list.length / cols), img = canvas(cols * (r.w * zoom + 4), rows * (r.h * zoom + 18));
        list.forEach((f, j) => {
          const x = (j % cols) * (r.w * zoom + 4), y = Math.floor(j / cols) * (r.h * zoom + 18);
          img.text(f.t.toFixed(2), x + 2, y + 3, 2);
          img.paste(upscale(f.color, r.w, r.h, zoom), r.w * zoom, r.h * zoom, x, y + 16);
        });
        made.push(save(base + ".png", img.png()));
      }
      console.log(`${id}  ${r.w} x ${r.h} 크기 ${r.n}프레임  ->  ${made.join("  ")}`);
    } catch (error) { failed++; console.error(`${id}  실패: ${error instanceof Error ? error.message : error}`); }
    finally { layers?.abort(); bundle?.abort(); }
  }
  process.exitCode = failed ? 1 : 0;
}
main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
