/** A complete browser example using the same visible selection as the gallery. */
export interface EffectExampleSelection2D {
  id:string; width:number; height:number; x:number; y:number;
  options:Record<string,unknown>; flip:boolean; acted:boolean; actor:boolean;
  background:string; speed:number;
}
export function effectExampleCode2D(s:EffectExampleSelection2D):string {
  if(!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(s.id))throw new RangeError('Invalid effect module id');
  const make=s.acted?'createAct':'createFx';
  const options:Record<string,unknown>={...s.options,x:s.x,y:s.y,flip:s.flip};
  delete options.actorAdapter;
  const draw=s.acted?['  fx.draw(frame, { body: true, target: true });']:[
    '  fx.draw(frame, "back");',
    ...(s.actor?[
      '  if (effect.meta.actor) drawActor(painterFor(frame).place(options.x, options.y, options.flip),',
      '    fx.options.actor ?? stockActor(), actorAlphaOf(effect, fx.t, fx.options));',
    ]:[]),
    '  fx.draw(frame, "front");',
  ];
  return [
    `import { createFrame, clearFrame, ${make}, composite, backdrop, drawActor, painterFor, stockActor, actorAlphaOf, sceneCameraOffset } from "poku-pixel-fx";`,
    `import * as effect from "poku-pixel-fx/fx/${s.id}";`,
    '',
    'const canvas = document.createElement("canvas");',
    `canvas.width = ${s.width}; canvas.height = ${s.height};`,
    'canvas.style.imageRendering = "pixelated";',
    'document.body.append(canvas);',
    'const ctx = canvas.getContext("2d");',
    'const imageData = ctx.createImageData(canvas.width, canvas.height);',
    `const frame = createFrame(${s.width}, ${s.height});`,
    `const options = ${JSON.stringify(options,null,2)};`,
    `const background = ${s.background==='none'?'null':`backdrop(${JSON.stringify(s.background)}, canvas.width, canvas.height, options.y)`};`,
    `let fx = ${make}(effect, options);`,
    'let last = performance.now();',
    'function animate(now) {',
    `  const dt = Math.max(0, Math.min(0.1, (now - last) / 1000)) * ${s.speed};`,
    '  last = now;',
    `  if (fx.done()) fx = ${make}(effect, options);`,
    '  fx.update(dt);',
    '  clearFrame(frame);',
    ...draw,
    '  composite(frame, imageData.data, background);',
    '  const [sx, sy] = sceneCameraOffset(fx.shake, matchMedia("(prefers-reduced-motion: reduce)").matches, background === null);',
    '  ctx.clearRect(0, 0, canvas.width, canvas.height);',
    '  ctx.putImageData(imageData, sx, sy);',
    '  requestAnimationFrame(animate);',
    '}',
    'requestAnimationFrame(animate);',
  ].join('\n');
}
