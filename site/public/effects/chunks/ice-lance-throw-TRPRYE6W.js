import {
  ice_lance_exports
} from "./chunk-LWLAJN7R.js";
import {
  snowflake_burst_exports
} from "./chunk-HMGGZXU4.js";
import "./chunk-MF3TJN2B.js";
import {
  spell_charge_exports
} from "./chunk-NKPTRSLR.js";
import "./chunk-AQVXRP43.js";
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
import {
  PAL
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/moves/ice-lance-throw.ts
var THROW = 0.8;
var FLY = 0.34;
var HIT = THROW + FLY;
var TX = 170;
var SPEED = (TX - 34) / FLY;
var meta = {
  name: "Ice lance throw",
  desc: "Frost gathers into a spear in his hand, he throws it like a javelin, and the target ices over in a burst of snowflakes and shivers.",
  tags: ["move", "ice", "spell", "projectile", "one-shot"],
  // Keep the exact-release tail and the 60/120 Hz burst fringe inside the sheet.
  size: [324, 136],
  origin: [96, 134],
  duration: HIT + 3.2,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 }
};
var HOLD = { ...READY, x: -3, crouch: 4, lean: 2, fx: 18, fy: -22, bx: 11, by: -17, ffx: 10, fbx: -8 };
var THROWN = { ...READY, x: 9, crouch: 4, lean: 6, fx: 19, fy: -24, bx: -6, by: -24, ffx: 13, fbx: -10, toeB: true };
var act = {
  target: { x: TX },
  poses: [
    [-0.4, { ...READY, x: -3 }],
    [0.06, { ...HOLD }],
    [THROW - 0.2, HOLD],
    [THROW - 0.03, { ...HOLD, crouch: 5, lean: -2, fx: 17, bx: 5, by: -20 }],
    [THROW, THROWN, "snap"],
    [HIT + 0.3, { ...THROWN, crouch: 3, lean: 4 }],
    [HIT + 0.9, { ...READY, x: -3 }],
    [HIT + 3.2, { ...READY, x: -3 }]
  ],
  hits: [
    { t: HIT, stop: 0.13, shake: 0.2, amp: 2, push: 2.4, straw: 12, skin: "ice", shiver: 1.4, y: -26 },
    { t: 2.75, push: 0.3, straw: 0, flash: 0, skin: null }
  ],
  dust: [{ t: THROW, x: 13, n: 6, dir: 1, c: "#d8f2ff" }]
};
var create = chain([
  { fx: spell_charge_exports, t: 0.06, until: THROW, palette: PAL.ice },
  { fx: ice_lance_exports, t: THROW, until: HIT, x: (t) => 34 + (t - THROW) * SPEED, y: -24 },
  { fx: snowflake_burst_exports, t: HIT, x: TX, y: -26 }
]);
export {
  act,
  create,
  meta
};
