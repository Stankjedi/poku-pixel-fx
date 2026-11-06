import {
  fireball_exports
} from "./chunk-CDXC2PVF.js";
import {
  small_explosion_exports
} from "./chunk-QNS4HZVZ.js";
import "./chunk-D7HZHFYB.js";
import {
  spell_charge_exports
} from "./chunk-GTTICKDM.js";
import "./chunk-6AZGJX4J.js";
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
import {
  PAL,
  smooth
} from "./chunk-MBWWV6CB.js";
import "./chunk-G6VBW32E.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/moves/fireball-throw.ts
var THROW = 0.95;
var FLY = 0.46;
var HIT = THROW + FLY;
var TX = 190;
var LAUNCH_X = 28;
var NOSE = 5.6;
var SPEED = (TX - NOSE - LAUNCH_X) / FLY;
var HANDOFF = 0.05;
var meta = {
  name: "Fireball throw",
  desc: "He gathers fire in his hand, leans back and hurls it: the ball flies, the target takes it in a blast and comes out charred.",
  tags: ["move", "fire", "spell", "projectile", "explosion", "one-shot"],
  size: [356, 244],
  origin: [64, 198],
  duration: HIT + 5.4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1, choreography: "continuous" }
};
var HOLD = { ...READY, x: -3, crouch: 4, lean: 2, fx: 18, fy: -22, bx: 11, by: -17, ffx: 10, fbx: -8 };
var THROWN = { ...READY, x: 9, crouch: 4, lean: 6, fx: 19, fy: -22, bx: -6, by: -24, ffx: 13, fbx: -10, toeB: true };
var FLINCH = { turn: 0.9, x: 7, crouch: 5, lean: -3, fx: -4, fy: -36, bx: 5, by: -33, ffx: 4, fbx: -4 };
var act = {
  target: { x: TX },
  poses: [
    [-0.42, { ...READY, x: -3 }],
    [0.08, { ...HOLD }],
    [0.5, HOLD],
    [THROW - 0.03, { ...HOLD, crouch: 5, lean: -2, fx: 17, bx: 5, by: -20 }],
    [THROW, THROWN, "snap"],
    [HIT - 0.02, { ...THROWN, crouch: 3, lean: 4 }],
    [HIT, FLINCH, "snap"],
    [HIT + 0.7, { ...FLINCH, crouch: 3, lean: -2 }],
    [HIT + 1.4, { ...READY, x: 4 }],
    [HIT + 2.1, { ...READY, x: -3 }],
    [HIT + 5.4, { ...READY, x: -3 }]
  ],
  hits: [
    { t: HIT, stop: 0.18, shake: 0.38, amp: 3, push: 3.4, straw: 34, skin: "char" },
    { t: HIT + 4.8, push: 0, straw: 0, flash: 0, skin: null }
  ],
  dust: [{ t: THROW, x: 13, n: 7, dir: 1 }]
};
function create(o) {
  const classic = o.choreography === "classic";
  return chain([
    // Shift the gathered energy with the throwing hand, then crossfade it into the
    // projectile for two frames. Fades affect this cue's color AND light only.
    {
      fx: spell_charge_exports,
      t: 0.08,
      until: THROW + (classic ? 0 : HANDOFF),
      palette: o.palette ?? PAL.fire,
      x: classic ? 0 : (t) => 13 * smooth(THROW - 0.06, THROW, t),
      fadeIn: classic ? 0 : 0.14,
      fadeOut: classic ? 0 : HANDOFF,
      light: classic ? 1 : 0.78
    },
    {
      fx: fireball_exports,
      t: THROW,
      until: HIT,
      x: (t) => LAUNCH_X + (t - THROW) * SPEED,
      y: -22,
      fadeIn: classic ? 0 : HANDOFF,
      light: classic ? 1 : 0.86
    },
    { fx: small_explosion_exports, t: HIT, x: TX, light: classic ? 1 : 0.82 }
  ])(o);
}
export {
  act,
  create,
  meta
};
