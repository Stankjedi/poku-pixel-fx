import {
  earth_spike_exports
} from "./chunk-Q4G6CTX4.js";
import "./chunk-5FLQZTBR.js";
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

// src/fx/moves/earth-stomp.ts
var STOMP = 0.06;
var RAM = STOMP + 0.43;
var TX = 112;
var meta = {
  name: "Earth stomp",
  desc: "A knee comes up, the boot slams down, the floor heaves under the target and a stone spike rams up through it.",
  tags: ["move", "earth", "spell", "stomp", "one-shot"],
  size: [294, 142],
  origin: [54, 128],
  duration: STOMP + 3.4,
  loop: false,
  fps: 30,
  bg: "ground",
  actor: 2,
  options: { seed: 1 }
};
var KNEE = { ...READY, crouch: 1, lean: -3, fx: 3, fy: -34, bx: 11, by: -30, ffx: 9, ffy: -15, fbx: -5 };
var SLAM = { ...READY, crouch: 7, lean: 3, fx: 14, fy: -14, bx: -5, by: -18, ffx: 11, fbx: -9 };
var act = {
  target: { x: TX },
  poses: [
    [-0.5, READY],
    [-0.14, KNEE],
    [STOMP - 5e-3, { ...KNEE, ffy: -17 }],
    [STOMP, SLAM, "snap"],
    [RAM + 0.5, { ...SLAM, crouch: 5 }],
    [RAM + 1.1, READY],
    [STOMP + 3.4, READY]
  ],
  hits: [
    { t: STOMP, stop: 0.1, shake: 0.2, amp: 3, target: false },
    { t: RAM, stop: 0.14, shake: 0.28, amp: 3, push: -3.2, straw: 30, y: -10 }
  ],
  dust: [{ t: STOMP, x: 11, n: 9 }]
};
var create = chain([{ fx: earth_spike_exports, t: STOMP, x: TX }]);
export {
  act,
  create,
  meta
};
