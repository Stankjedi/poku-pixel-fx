import {
  muzzle_pistol_exports
} from "./chunk-LWVSIQTN.js";
import {
  bullet_tracer_exports
} from "./chunk-6CABJQLF.js";
import "./chunk-XI5ZVMM5.js";
import {
  hit_spark_exports
} from "./chunk-4MV5FW5C.js";
import {
  READY
} from "./chunk-ZHMERMWE.js";
import {
  chain
} from "./chunk-VBA4AN6M.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/moves/pistol-shots.ts
var SHOTS = [0.14, 0.42, 0.7];
var FLY = 0.12;
var TX = 180;
var BY = -32;
var MX = 28;
var meta = {
  name: "Pistol shots",
  desc: "Three aimed shots: the gun kicks up each time and settles, tracers cross the floor, and the target staggers under each hit.",
  tags: ["move", "gun", "pistol", "projectile", "ranged", "one-shot"],
  size: [378, 76],
  origin: [111, 72],
  duration: 2.6,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 }
};
var REST_ = { ...READY, weapon: "pistol", sa: 0.9, fx: 10, fy: -17, bx: 7, by: -16 };
var AIM = { ...REST_, crouch: 3, lean: 2, fx: 18, fy: -28, sa: 0, bx: 12, by: -25, ffx: 11, fbx: -9 };
var KICK = { ...AIM, lean: 0, fx: 16, fy: -33, sa: -0.45, by: -28 };
var keys = SHOTS.flatMap((t) => [[t, AIM], [t + 1e-3, KICK, "snap"], [t + 0.14, AIM]]);
var act = {
  target: { x: TX },
  poses: [[-0.36, REST_], [-0.06, AIM], ...keys, [1.2, { ...AIM, crouch: 1 }], [1.7, REST_], [2.6, REST_]],
  hits: SHOTS.map((t, i) => ({ t: t + FLY, stop: i === 2 ? 0.08 : 0.04, shake: 0.1, amp: 1 + (i === 2 ? 1 : 0), push: i % 2 ? -1.8 : 2, straw: 10, y: -30, kick: 1 }))
};
var create = chain([
  ...SHOTS.flatMap((t) => [
    { fx: muzzle_pistol_exports, t, x: MX, height: -BY },
    { fx: bullet_tracer_exports, t, until: t + FLY, x: (u) => MX + 4 + (u - t) * ((TX - MX - 14) / FLY), y: BY },
    { fx: hit_spark_exports, t: t + FLY, x: TX - 10, height: 28 }
  ])
]);
export {
  act,
  create,
  meta
};
