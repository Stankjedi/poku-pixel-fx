import {
  muzzle_shotgun_exports
} from "./chunk-LU5X4MML.js";
import {
  rocket_exports
} from "./chunk-WMTQORX3.js";
import "./chunk-XI5ZVMM5.js";
import {
  small_explosion_exports
} from "./chunk-E7SX2TFX.js";
import {
  READY
} from "./chunk-JQXGDKYD.js";
import {
  chain
} from "./chunk-NPBZD3DI.js";
import "./chunk-LCIPQSGQ.js";
import "./chunk-MIW2CWC4.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-Z52ZYDDH.js";
import "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/moves/rocket-launcher.ts
var FIRE = 0.6;
var FLY = 0.56;
var HIT = FIRE + FLY;
var TX = 200;
var MY = -21;
var MX = 34;
var meta = {
  name: "Rocket launcher",
  desc: "He drops to one knee, shoulders the tube and fires: the kick shoves him back along the floor, the rocket crawls out on its jet and the target goes up.",
  tags: ["move", "gun", "rocket", "projectile", "explosion", "one-shot"],
  size: [480, 244],
  origin: [178, 198],
  duration: HIT + 5.4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 }
};
var REST_ = { ...READY, weapon: "launcher", two: true, sa: -1, fx: 9, fy: -19 };
var KNEEL = { ...READY, weapon: "launcher", two: true, sa: 0, fx: 9, fy: -17, crouch: 6, lean: 2, ffx: 12, fbx: -9 };
var KICKED = { ...KNEEL, x: -6, sa: -0.12, fx: 4, fy: -19, lean: -4, crouch: 5 };
var act = {
  target: { x: TX },
  poses: [
    [-0.52, REST_],
    [-0.18, KNEEL],
    [FIRE - 1e-3, { ...KNEEL, crouch: 7 }],
    [FIRE, KICKED, "snap"],
    [FIRE + 0.36, { ...KNEEL, x: -6 }],
    [HIT + 0.9, { ...KNEEL, x: -6, crouch: 5, lean: 1 }],
    [HIT + 1.5, { ...REST_, x: -3 }],
    [HIT + 2.2, { ...REST_, x: 0 }],
    [HIT + 5.4, REST_]
  ],
  hits: [
    { t: FIRE, stop: 0.06, shake: 0.22, amp: 2, target: false },
    { t: HIT, stop: 0.2, shake: 0.45, amp: 4, push: 3.8, straw: 44, skin: "char" },
    { t: HIT + 4.8, push: 0, straw: 0, flash: 0, skin: null }
  ],
  dust: [{ t: FIRE, x: -16, n: 10, dir: -1 }]
};
var create = chain([
  { fx: muzzle_shotgun_exports, t: FIRE, x: MX, height: -MY },
  { fx: rocket_exports, t: FIRE, until: HIT, x: (t) => MX + 10 + (t - FIRE) ** 1.5 * ((TX - MX - 16) / FLY ** 1.5), y: MY },
  { fx: small_explosion_exports, t: HIT, x: TX }
]);
export {
  act,
  create,
  meta
};
