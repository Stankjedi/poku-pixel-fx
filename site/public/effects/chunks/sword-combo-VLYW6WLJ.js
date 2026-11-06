import {
  act as act3,
  sword_slash_exports
} from "./chunk-E4BHQUOY.js";
import {
  act,
  double_slash_exports
} from "./chunk-7PUONAZA.js";
import {
  act as act2,
  heavy_cleave_exports
} from "./chunk-ZANBFGWD.js";
import "./chunk-RPLQU5SV.js";
import {
  READY
} from "./chunk-63MS6FM2.js";
import {
  chain,
  shiftHits,
  shiftKeys
} from "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-LK75UMZK.js";
import "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
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
