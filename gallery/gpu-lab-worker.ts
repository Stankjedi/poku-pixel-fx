import { renderDrawSceneCPU, type DrawScene } from '../src/render/draw-ir.js';
import { CinematicCompositor, type CinematicOptions } from '../src/render/cinematic.js';
const compositor = new CinematicCompositor();
self.onmessage = (event: MessageEvent<{ id: number; scene: DrawScene; options: CinematicOptions }>) => {
  const { id, scene, options } = event.data;
  try {
    const start = performance.now(), frame = renderDrawSceneCPU(scene);
    const rgba = compositor.render(frame, new Uint8ClampedArray(frame.w * frame.h * 4), options);
    const message = { id, rgba, width: frame.w, height: frame.h, milliseconds: performance.now() - start };
    (self as unknown as { postMessage(message: unknown, transfer: Transferable[]): void }).postMessage(message, [rgba.buffer as ArrayBuffer]);
  } catch (error) { self.postMessage({ id, error: error instanceof Error ? error.message : String(error) }); }
};
