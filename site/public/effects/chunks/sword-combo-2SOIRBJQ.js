import {
  act,
  double_slash_exports
} from "./chunk-AYVEUTSL.js";
import {
  act as act2,
  heavy_cleave_exports
} from "./chunk-FTIQ4DFU.js";
import {
  act as act3,
  sword_slash_exports
} from "./chunk-J42T7K2E.js";
import "./chunk-UT2MMU2A.js";
import {
  READY,
  chain,
  shiftHits,
  shiftKeys
} from "./chunk-KJLRN7JI.js";
import "./chunk-NY4VHNMV.js";
import "./chunk-WFSCDWU6.js";
import "./chunk-T3JNBT34.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/moves/sword-combo.ts
var A = 0;
var B = 0.5;
var C = 1.04;
var STEP = 10;
var FINISH = C + 0.335;
var meta = {
  name: "Sword combo",
  desc: "Three strokes walking forward: a slash, a crossing double cut, and a two-handed cleave into the floor that throws the target about.",
  tags: ["move", "melee", "sword", "combo", "one-shot"],
  size: [264, 150],
  origin: [72, 130],
  duration: FINISH + 1.6,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 }
};
var until = (keys, t) => keys.filter((k) => k[0] <= t);
var STAND_ = { ...READY, weapon: "sword", fx: 11, fy: -15, sa: 0.38 };
var act4 = {
  target: { x: 118 },
  poses: [
    ...shiftKeys(until(act3.poses, 0.3), A),
    ...shiftKeys(until(act.poses, 0.27).filter((k) => k[0] >= -0.14), B, { dx: STEP }),
    ...shiftKeys(act2.poses.filter((k) => k[0] >= -0.3), C, { dx: STEP * 2, weapon: "sword" }),
    [FINISH + 1.6, { ...STAND_, x: STEP * 2 - 4 }]
  ],
  hits: [...shiftHits(act3.hits, A), ...shiftHits(act.hits, B), ...shiftHits(act2.hits, C)],
  dust: [...shiftHits(act3.dust, A).map((d) => ({ ...d })), ...shiftHits(act2.dust, C).map((d) => ({ ...d, x: d.x + STEP * 2 }))]
};
var create = chain([
  { fx: sword_slash_exports, t: A },
  { fx: double_slash_exports, t: B, x: STEP },
  { fx: heavy_cleave_exports, t: C, x: STEP * 2 }
]);
export {
  act4 as act,
  create,
  meta
};
