import {
  lightning_strike_exports
} from "./chunk-KFYZXI75.js";
import "./chunk-BIDU34BZ.js";
import {
  READY
} from "./chunk-BIQMVPKA.js";
import {
  chain
} from "./chunk-I2D4GEWW.js";
import "./chunk-FEXYTCCO.js";
import "./chunk-3L2ANF6Q.js";
import "./chunk-JQMAFXP4.js";
import "./chunk-WSFCRVEQ.js";

// src/fx/moves/lightning-call.ts
var BOLT = 0.76;
var TX = 130;
var meta = {
  name: "Lightning call",
  desc: "An arm goes up, a sigil lights under the target, and on the downswing a thick bolt comes down on it; the target jolts through the aftershocks.",
  tags: ["move", "lightning", "spell", "strike", "one-shot"],
  size: [290, 266],
  origin: [42, 231],
  duration: 3,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 }
};
var UP = { ...READY, crouch: 1, lean: -2, fx: 2, fy: -44, bx: 8, by: -19, ffx: 7, fbx: -5 };
var DOWN = { ...READY, crouch: 5, lean: 5, fx: 18, fy: -27, bx: -7, by: -24, ffx: 12, fbx: -10, toeB: true };
var act = {
  target: { x: TX },
  poses: [
    [0, READY],
    [0.26, UP],
    [BOLT - 0.04, { ...UP, y: -1, crouch: -1 }],
    [BOLT, DOWN, "snap"],
    [1.4, { ...DOWN, crouch: 3, lean: 4 }],
    [2, READY],
    [3, READY]
  ],
  hits: [
    { t: BOLT, stop: 0.14, shake: 0.32, amp: 3, push: 2.8, straw: 24, skin: "shock", shiver: 1.2 },
    { t: 1.04, stop: 0.03, push: 1.2, straw: 8 },
    { t: 1.26, stop: 0.03, push: -1, straw: 6 },
    { t: 2.5, push: 0, straw: 0, flash: 0, skin: null }
  ],
  dust: [{ t: BOLT, x: 14, n: 6, dir: 1 }]
};
var create = chain([{ fx: lightning_strike_exports, t: 0, x: TX }]);
export {
  act,
  create,
  meta
};
