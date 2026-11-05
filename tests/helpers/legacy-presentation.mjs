import { renderSequence } from '../../build-tools/tools/lib/fxlib.mjs';

/**
 * The reviewed artwork fixtures were captured with naive `time += 1 / fps`.
 * Their timestamps sometimes sit one ULP below a discrete animation boundary.
 * Preserve those exact draw inputs while exercising the current createFx,
 * fixed-step updates, painter, options, layering and export code. This changes
 * only the draw argument; simulation and composition clocks are not replaced.
 */
export function legacyPresentationModule(mod, readTime) {
  const duration = mod.meta?.duration ?? 1;
  const drawTime = () => mod.meta?.loop ? readTime() % duration : Math.min(readTime(), duration);
  const wrap = impl => ({
    ...impl,
    draw(p, _time, options) { return impl.draw(p, drawTime(), options); },
    ...(impl.drawBack ? { drawBack(p, _time, options) { return impl.drawBack(p, drawTime(), options); } } : {}),
  });
  return mod.create ? { ...mod, create: options => wrap(mod.create(options)) } : wrap(mod);
}

/** Small golden-fixture collector; production exports continue to stream. */
export function renderLegacyPresentationFrames(effect, options = {}) {
  let time = 0;
  const mod = legacyPresentationModule(effect.mod, () => time);
  const sequence = renderSequence({ ...effect, mod }, options);
  const iterator = sequence.frames[Symbol.iterator](), frames = [];
  for (let i = 0; i < sequence.n; i++) {
    if (i) time += 1 / sequence.fps;
    const next = iterator.next();
    if (next.done) throw new Error('Legacy artwork fixture ended before its declared frame count');
    frames.push(next.value);
  }
  if (!iterator.next().done) throw new Error('Legacy artwork fixture exceeded its declared frame count');
  return { ...sequence, frames };
}
