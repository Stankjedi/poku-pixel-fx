#!/usr/bin/env node
// Find effects: node tools/list.mjs [words...]
// Matches ids, names, tags and descriptions; no words lists everything.

import { allIds, loadEffect } from "./lib/fxlib.mjs";
const { effectsKo, tagsKo } = await import(new URL("../../build/i18n/ko/index.js", import.meta.url).href);

const words = process.argv.slice(2).map((w) => w.toLowerCase());
let n = 0;
for (const id of allIds()) {
  let m;
  try {
    m = (await loadEffect(id)).meta;
  } catch {
    continue;
  }
  const ko = effectsKo[id];
  const hay = [id, m.name, m.desc, ko?.name, ko?.desc, ...m.tags, ...m.tags.map((tag: string) => tagsKo[tag] ?? tag)].join(" ").toLowerCase();
  if (!words.every((w) => hay.includes(w))) continue;
  n++;
  const kind = m.loop ? `반복 ${m.duration}초` : `한 번 ${m.duration}초`;
  console.log(`${id.padEnd(30)} ${kind.padEnd(11)} ${(m.size[0] + "x" + m.size[1]).padEnd(8)} ${m.actor ? "캐릭터  " : "        "}${ko?.name ?? m.name}: ${ko?.desc ?? m.desc}`);
}
console.log(`\n${n}개 이펙트`);
