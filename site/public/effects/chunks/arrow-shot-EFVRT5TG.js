import {
  arrow_exports
} from "./chunk-U2TEBIWQ.js";
import "./chunk-XI5ZVMM5.js";
import {
  hit_spark_exports
} from "./chunk-SJBPA4YH.js";
import {
  READY
} from "./chunk-SRKY5KGN.js";
import {
  chain
} from "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-7OMNYR2P.js";
import "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/moves/arrow-shot.ts
var LOOSE = 0.56;
var FLY = 0.24;
var HIT = LOOSE + FLY;
var TX = 180;
var SPEED = (TX - 30) / FLY;
var meta = {
  name: "Arrow shot",
  desc: "He raises the bow, draws to his cheek, holds his breath and looses: the string snaps forward, the arrow crosses the floor and thuds home.",
  tags: ["move", "bow", "arrow", "projectile", "ranged", "one-shot"],
  // Keep the full launch wake and seeded impact spray, including between export frames.
  // Padding changes only sheet framing; the bow, trajectory and hit stay in local space.
  size: [344, 88],
  origin: [62, 80],
  duration: 1.9,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 }
};
var REST_ = { ...READY, weapon: "bow", sa: -0.4, fx: 12, fy: -20, bx: 6, by: -17 };
var AIM = { ...REST_, crouch: 3, lean: 1, fx: 18, fy: -28, sa: 0, bx: 10, by: -27, nocked: true, ffx: 11, fbx: -9 };
var DRAWN = { ...AIM, crouch: 4, lean: -2, fx: 18, bx: -3, by: -29, pull: true };
var LOOSED = { ...AIM, crouch: 3, lean: 2, fx: 19, fy: -28, bx: -9, by: -32, nocked: false, pull: false };
var act = {
  target: { x: TX },
  poses: [
    [-0.44, REST_],
    [-0.14, AIM],
    [0.16, DRAWN],
    [LOOSE, { ...DRAWN, crouch: 4 }],
    [LOOSE + 2e-3, LOOSED, "snap"],
    [1.1, { ...LOOSED, bx: -6, by: -25 }],
    [1.6, REST_],
    [1.9, REST_]
  ],
  hits: [{ t: HIT, stop: 0.07, shake: 0.12, amp: 2, push: 2.2, straw: 14, y: -28 }]
};
var create = chain([
  { fx: arrow_exports, t: LOOSE, until: HIT, x: (t) => 30 + (t - LOOSE) * SPEED, y: -28 },
  { fx: hit_spark_exports, t: HIT, x: TX - 10, height: 30 }
]);
export {
  act,
  create,
  meta
};
