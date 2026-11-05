import {
  renderDrawSceneCPU
} from "./chunks/chunk-WACKDVI2.js";
import {
  CinematicCompositor
} from "./chunks/chunk-JQMAFXP4.js";
import "./chunks/chunk-WSFCRVEQ.js";

// gallery/gpu-lab-worker.ts
var compositor = new CinematicCompositor();
self.onmessage = (event) => {
  const { id, scene, options } = event.data;
  try {
    const start = performance.now(), frame = renderDrawSceneCPU(scene);
    const rgba = compositor.render(frame, new Uint8ClampedArray(frame.w * frame.h * 4), options);
    const message = { id, rgba, width: frame.w, height: frame.h, milliseconds: performance.now() - start };
    self.postMessage(message, [rgba.buffer]);
  } catch (error) {
    self.postMessage({ id, error: error instanceof Error ? error.message : String(error) });
  }
};
