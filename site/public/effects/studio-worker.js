import {
  createProjectRuntime
} from "./chunks/chunk-K4GY6LEG.js";
import "./chunks/chunk-I2CEDLVF.js";
import "./chunks/chunk-WOI4FPYF.js";
import "./chunks/chunk-BTOTHK6M.js";
import "./chunks/chunk-FLVIEPJE.js";
import {
  separateFrameLayers
} from "./chunks/chunk-VBA4AN6M.js";
import "./chunks/chunk-LCIPQSGQ.js";
import "./chunks/chunk-MIW2CWC4.js";
import "./chunks/chunk-JQMAFXP4.js";
import "./chunks/chunk-MBWWV6CB.js";
import "./chunks/chunk-G6VBW32E.js";
import "./chunks/chunk-WSFCRVEQ.js";

// gallery/studio-worker.ts
var worker = globalThis;
var current;
worker.onmessage = (e) => {
  const m = e.data;
  if (m.type === "ack" && current && current.id === m.id) {
    current.ack?.();
    current.ack = void 0;
    return;
  }
  if (m.type === "cancel" && current && current.id === m.id) {
    current.cancelled = true;
    current.ack?.();
    return;
  }
  if (m.type !== "bake") return;
  if (current) {
    current.cancelled = true;
    current.ack?.();
  }
  const job = { id: m.id, cancelled: false, ack: void 0 };
  current = job;
  void (async () => {
    const runtime = await createProjectRuntime(m.project);
    try {
      const fps = runtime.project.fps, duration = runtime.project.seconds ?? runtime.duration;
      const count = runtime.frameCount;
      if (count > 4096 || runtime.width * runtime.height > 4194304) throw new RangeError("Bake exceeds 4096 frames or 4 megapixels per frame");
      worker.postMessage({ type: "begin", id: job.id, count, width: runtime.width, height: runtime.height, fps, loop: runtime.loop, effectDuration: runtime.mod.meta.duration, origin: runtime.origin, contacts: runtime.contacts, events: runtime.events });
      for (let i = 0; i < count && !job.cancelled; i++) {
        const sample = runtime.render(i / fps, i, false, false, "asset"), { color, emission } = separateFrameLayers(sample.frame);
        const wait = new Promise((resolve) => {
          job.ack = resolve;
        });
        worker.postMessage({ type: "frame", id: job.id, index: i, time: sample.time, rgba: color.buffer, emission: emission.buffer, sockets: sample.sockets, frozen: sample.frozen }, [color.buffer, emission.buffer]);
        await wait;
      }
      worker.postMessage({ type: job.cancelled ? "cancelled" : "done", id: job.id });
    } finally {
      runtime.dispose();
      if (current === job) current = void 0;
    }
  })().catch((error) => {
    worker.postMessage({ type: "error", id: job.id, message: String(error) });
    if (current === job) current = void 0;
  });
};
