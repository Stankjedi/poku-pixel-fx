import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';

const checks = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const color = (r, g, b, a = 255) => (r | g << 8 | b << 16 | a << 24) >>> 0;
const unpack = (pixels, mask) => {
  const out = Buffer.alloc(pixels.length * 4);
  pixels.forEach((c, i) => out.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, mask && !mask[i] ? 0 : c >>> 24], i * 4));
  return out;
};
const indices = mask => mask.flatMap((v, i) => v ? [i] : []);
const alpha = bytes => Buffer.from(Array.from({ length: bytes.length / 4 }, (_, i) => bytes[i * 4 + 3]));
const pixel = (bytes, width, x, y) => [...bytes.subarray((y * width + x) * 4, (y * width + x + 1) * 4)];
const documentFixture = (name, width, height, pixels = Array(width * height).fill(0), extra = {}) => ({
  schema: 'poku-pixel-art/v2', name, width, height, pixels, layers: [], selection: Array(width * height).fill(0), ...extra,
});
// An explicit source/destination table is the oracle; no production transform or renderer is imported.
const moved = (pixels, pairs, copy = false) => {
  const out = pixels.slice(); if (!copy) for (const [from] of pairs) out[from] = 0;
  for (const [from, to] of pairs) out[to] = pixels[from];
  return out;
};
const crop = (bytes, imageWidth, x, y, width, height) => {
  const out = Buffer.alloc(width * height * 4);
  for (let row = 0; row < height; row++) bytes.copy(out, row * width * 4, ((y + row) * imageWidth + x) * 4, ((y + row) * imageWidth + x + width) * 4);
  return out;
};
const decodeRuns = frame => {
  const result = []; for (let i = 0; i < frame.runs.length; i += 2) for (let n = 0; n < frame.runs[i]; n++) result.push(frame.runs[i + 1]);
  return unpack(result);
};

const temporary = await mkdtemp(join(tmpdir(), 'poku-pixel-pro-qa-'));
let report, phase = 'initialization';
try {
  report = await withHarnessBrowser(async browser => {
    const { send, evaluate, waitFor } = browser;
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const painted = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    const ready = async (predicate = 'true', allowError = false) => {
      await waitFor("document.getElementById('result')?.dataset.ready==='true'"); await painted();
      await waitFor(`(()=>{const s=document.getElementById('status');if(!${allowError}&&s?.classList.contains('error'))throw new Error(s.textContent);return document.getElementById('result')?.dataset.ready==='true'&&(${predicate});})()`);
    };
    const change = async (id, value, event = 'change') => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
      await ready();
    };
    const checked = async (id, value) => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(e.checked!==${Boolean(value)})e.click();})()`); await ready();
    };
    const readCanvas = async (selector = '#result') => {
      const raw = await evaluate(`(()=>{const c=document.querySelector(${JSON.stringify(selector)}),data=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let binary='';for(let i=0;i<data.length;i+=16384)binary+=String.fromCharCode(...data.subarray(i,i+16384));return {width:c.width,height:c.height,base64:btoa(binary)};})()`);
      return { width: raw.width, height: raw.height, rgba: Buffer.from(raw.base64, 'base64') };
    };
    const link = suffix => `document.querySelector(${JSON.stringify(`#downloads a[download$="${suffix}"]`)})`;
    const readDownload = async suffix => {
      const raw = await evaluate(`(async()=>{const a=${link(suffix)},bytes=new Uint8Array(await(await fetch(a.href)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return {name:a.download,base64:btoa(binary)};})()`);
      return { name: raw.name, bytes: Buffer.from(raw.base64, 'base64') };
    };
    const exportFile = async (control, suffix) => {
      const before = await evaluate(`(()=>{const s=document.getElementById('status'),watch={errors:[]};
        watch.observer=new MutationObserver(()=>{if(s.classList.contains('error'))watch.errors.push(s.textContent);});
        watch.observer.observe(s,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class']});
        window.__proDownloadWatch=watch;return ${link(suffix)}?.href??'';})()`);
      try {
        await click(control);
        // A deliberately rejected edit can leave its status visible when an async
        // export begins. Observe new emissions, including the same error text, and
        // require the completed download to have a successful visible status.
        await waitFor(`(()=>{const a=${link(suffix)},s=document.getElementById('status'),errors=window.__proDownloadWatch.errors;
          if(errors.length)throw new Error(errors[0]);if(!a||a.href===${JSON.stringify(before)})return false;
          if(s?.classList.contains('error'))throw new Error(s.textContent);return true;})()`);
        return await readDownload(suffix);
      } finally {
        await evaluate('window.__proDownloadWatch?.observer.disconnect();delete window.__proDownloadWatch;');
      }
    };
    const exportPNG = async (control = 'save-png', suffix = '.png') => {
      const file = await exportFile(control, suffix), decoded = decodePNG(file.bytes);
      return { ...decoded, rgba: Buffer.from(decoded.rgba), name: file.name };
    };
    const exportProject = async () => JSON.parse((await exportFile('save-project', '.poku-pixel-art.json')).bytes.toString('utf8'));
    const upload = async (name, document) => {
      const path = join(temporary, name); await writeFile(path, JSON.stringify(document));
      const dom = await send('DOM.getDocument'), input = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#project-file' });
      await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path] });
      await waitFor("document.getElementById('project-file').value===''"); await ready();
    };
    const stroke = async (points, { modifiers = 0, allowError = false, selector = '#result' } = {}) => {
      await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'center',inline:'center'})`); await painted();
      const screen = await evaluate(`(()=>{const c=document.querySelector(${JSON.stringify(selector)}),r=c.getBoundingClientRect();return ${JSON.stringify(points)}.map(([x,y])=>({x:r.left+(x+.5)*r.width/c.width,y:r.top+(y+.5)*r.height/c.height}));})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...screen[0], button: 'none', buttons: 0, modifiers });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...screen[0], button: 'left', buttons: 1, clickCount: 1, modifiers });
      for (const point of screen.slice(1)) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, button: 'left', buttons: 1, modifiers });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...screen.at(-1), button: 'left', buttons: 0, clickCount: 1, modifiers });
      await ready('true', allowError);
    };
    const chooseFrame = async index => {
      await evaluate(`(()=>{const b=document.querySelectorAll('#frame-list button')[${index}];if(!b)throw new Error('Missing frame');b.click();})()`); await ready();
    };
    const exportSheet = async () => {
      const before = await evaluate(`${link('-sheet.json')}?.href??''`), png = await exportPNG('save-animation-sheet', '-sheet.png');
      await waitFor(`${link('-sheet.json')}?.href!==${JSON.stringify(before)}&&!!${link('-sheet.json')}`);
      return { png, manifest: JSON.parse((await readDownload('-sheet.json')).bytes.toString('utf8')) };
    };

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1.5, mobile: false });
    await browser.navigate('/gallery/pixel-art-lab.html'); await ready();
    await evaluate(() => document.fonts.ready.then(() => true));

    phase = 'native selection and transform editing';
    const w = 16, h = 12, original = Array(w * h).fill(0), from = [34, 35, 36, 50, 51, 52];
    const detail = [color(220, 30, 45), color(24, 190, 65, 128), color(30, 60, 220, 1), color(240, 170, 30), color(60, 200, 210, 199), color(220, 50, 180)];
    from.forEach((index, i) => original[index] = detail[i]); original[171] = color(101, 112, 123);
    await upload('transform-input.json', documentFixture('Native transform proof', w, h, original));
    await change('zoom', '8'); await change('view', 'color'); await change('paint-tool', 'select-rectangle');
    await stroke([[2, 2], [4, 3]]);
    const selected = await exportProject();
    assert(isDeepStrictEqual(indices(selected.selection), from) && selected.layers.length === 0,
      'Physical rectangle selection includes every dragged endpoint cell without adding a paint/material layer');
    await checked('show-grid', true);
    assert((await exportPNG()).rgba.equals(unpack(original)),
      'Selection and grid overlays do not enter the exact straight-RGBA PNG, including alpha 1 and 128');
    await change('paint-tool', 'move'); await stroke([[2, 2], [4, 5]]);
    const destinations = [84, 85, 86, 100, 101, 102];
    let expected = moved(original, from.map((i, k) => [i, destinations[k]]));
    const movedPNG = await exportPNG(), movedProject = await exportProject();
    assert(movedPNG.rgba.equals(unpack(expected)) && isDeepStrictEqual(indices(movedProject.selection), destinations)
      && movedProject.layers.at(-1).kind === 'transform' && isDeepStrictEqual(movedProject.layers.at(-1).transform.offset, [2, 3])
      && isDeepStrictEqual(movedProject.pixels, original),
    'Dragging creates a replayable transform layer, moves exact source bytes, follows the object with the selection, and leaves source artwork intact');
    await click('flip-selection-x'); await ready();
    expected = moved(expected, [[84, 86], [85, 85], [86, 84], [100, 102], [101, 101], [102, 100]]);
    const flipped = await exportPNG();
    assert(flipped.rgba.equals(unpack(expected)), 'The horizontal flip reverses the selected native color order without altering alpha');
    await click('rotate-selection-right'); await ready();
    expected = moved(expected, [[84, 85], [85, 101], [86, 117], [100, 84], [101, 100], [102, 116]]);
    const rotated = await exportPNG(), rotatedProject = await exportProject();
    assert(rotated.rgba.equals(unpack(expected)) && isDeepStrictEqual(indices(rotatedProject.selection), [84, 85, 100, 101, 116, 117]),
      'A non-square 3×2 selection rotates into 2×3 cells about its top-left anchor without half-cell filtering');
    await click('undo'); await ready(); assert((await exportPNG()).rgba.equals(flipped.rgba), 'Undo removes a complete transform and restores its exact predecessor');
    await click('redo'); await ready(); assert((await exportPNG()).rgba.equals(rotated.rgba), 'Redo restores exact transform output');
    await upload('transform-reopened.json', rotatedProject);
    assert((await exportPNG()).rgba.equals(rotated.rgba) && isDeepStrictEqual((await exportProject()).layers, rotatedProject.layers),
      'Saving and reopening retains every transform layer and the byte-exact result');

    phase = 'protection, wrapping and free selection';
    const protectedPixels = original.slice(); protectedPixels[37] = color(9, 77, 121);
    const protection = Array(w * h).fill(0); protection[37] = 1;
    await upload('protected-transform.json', documentFixture('Protected detail', w, h, protectedPixels, { protectedMask: protection }));
    await change('paint-tool', 'select-rectangle'); await stroke([[2, 2]]);
    await change('transform-x', 3); await change('transform-y', 0); await click('transform-apply');
    assert(await evaluate("document.getElementById('status').classList.contains('error')&&document.getElementById('status').textContent.includes('protected')"),
      'A transform collision with protected detail reports an error through the actual UI');
    assert((await exportPNG()).rgba.equals(unpack(protectedPixels)) && (await exportProject()).layers.length === 0,
      'Rejected protected collisions leave saved artwork and layer history unchanged');
    await change('transform-x', 100); await click('transform-apply');
    assert(await evaluate("document.getElementById('status').classList.contains('error')"), 'Default canvas-boundary rejection does not silently clip the selection');
    assert((await exportPNG()).rgba.equals(unpack(protectedPixels)), 'Rejected off-canvas movement leaves the exact previous output');
    await change('transform-boundary', 'wrap'); await change('transform-x', 15); await click('transform-apply'); await ready();
    const wrapped = moved(protectedPixels, [[34, 33]]);
    assert((await exportPNG()).rgba.equals(unpack(wrapped)) && isDeepStrictEqual(indices((await exportProject()).selection), [33]),
      'Explicit tile wrapping uses the canvas period and retains protected neighbors');
    await change('transform-boundary', 'reject');

    const lassoPixels = Array(64).fill(color(76, 112, 137));
    await upload('lasso-input.json', documentFixture('Concave selection', 8, 8, lassoPixels));
    await change('paint-tool', 'lasso'); await stroke([[1, 1], [5, 1], [5, 2], [3, 2], [3, 5], [1, 5]]);
    const lasso = await exportProject(), lassoExpected = [];
    for (let y = 1; y <= 5; y++) for (let x = 1; x <= (y <= 2 ? 5 : 3); x++) lassoExpected.push(y * 8 + x);
    assert(isDeepStrictEqual(indices(lasso.selection), lassoExpected) && (await exportPNG()).rgba.equals(unpack(lassoPixels)),
      'A physical concave lasso preserves its narrow arm and does not paint or recolor the source');
    await change('paint-tool', 'select-rectangle'); await stroke([[6, 6], [7, 7]], { modifiers: 8 });
    assert(isDeepStrictEqual(indices((await exportProject()).selection), [...lassoExpected, 54, 55, 62, 63]),
      'Shift-drag adds a disconnected rectangle to the existing lasso selection');
    await stroke([[1, 1], [2, 1]], { modifiers: 1 });
    assert(isDeepStrictEqual(indices((await exportProject()).selection), [...lassoExpected.filter(i => i !== 9 && i !== 10), 54, 55, 62, 63]),
      'Alt-drag subtracts exactly the specified native cells');

    phase = 'palette shade brush and failed transform cleanup';
    const halfInk = [color(0, 0, 0, 128), color(68, 68, 68, 128), color(255, 255, 255, 128), color(68, 68, 68, 128), color(17, 71, 137)];
    const shadeProtection = Array(12).fill(0); shadeProtection[3] = 1;
    await upload('shade-opacity.json', documentFixture('Half opacity shade', 6, 2, undefined, {
      protectedMask: shadeProtection, activeLayerId: 'ink', layers: [{ kind: 'paint', id: 'ink', name: 'Half ink', opacity: .5, indices: [0, 1, 2, 3, 4], pixels: halfInk }],
    }));
    await change('palette-count', 3); await click('generate-ramp'); await ready();
    await evaluate(() => [...document.querySelectorAll('#workbench-palette input')].forEach((input, i) => {
      input.value = ['#000000', '#444444', '#ffffff'][i]; input.dispatchEvent(new Event('input', { bubbles: true }));
    }));
    await change('paint-tool', 'shade-light'); await change('paint-size', 1, 'input'); await checked('paint-in-selection', false);
    const beforeShade = await exportPNG(); await stroke([[0, 0], [4, 0], [0, 0]]);
    const afterShade = await exportPNG(), shadeSaved = await exportProject(), shadeLayer = shadeSaved.layers.find(layer => layer.id === 'ink');
    const expectedShade = [color(68, 68, 68, 64), color(255, 255, 255, 64), color(255, 255, 255, 64), color(68, 68, 68, 64), color(17, 71, 137, 128), ...Array(7).fill(0)];
    assert(afterShade.rgba.equals(unpack(expectedShade)) && shadeLayer.opacity === .5 && shadeLayer.pixels.slice(0, 4).every(c => c >>> 24 === 128)
      && alpha(afterShade.rgba).equals(alpha(beforeShade.rgba)),
    'A retraced shade gesture advances one authored ramp step, preserves protected/off-ramp colors, and never applies layer opacity twice');
    await click('undo'); await ready(); assert((await exportPNG()).rgba.equals(beforeShade.rgba), 'Shade undo restores raw and visible ink alpha');
    await click('redo'); await ready(); await upload('shade-reopened.json', shadeSaved);
    assert((await exportPNG()).rgba.equals(afterShade.rgba), 'Shade editing survives saving and reopening with exact layer opacity');

    phase = 'repeated object nudges';
    const nudgePixels = Array(64 * 8).fill(0), objectColor = color(235, 89, 43);
    nudgePixels[130] = objectColor; nudgePixels[131] = color(39, 101, 173); nudgePixels[158] = color(71, 193, 129);
    await upload('nudge-input.json', documentFixture('Repeated native nudges', 64, 8, nudgePixels));
    await change('paint-tool', 'select-rectangle'); await stroke([[2, 2]]); await change('paint-tool', 'move');
    await evaluate('document.activeElement?.blur()');
    for (let i = 0; i < 40; i++) {
      await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowRight', code: 'ArrowRight', windowsVirtualKeyCode: 39, nativeVirtualKeyCode: 39 });
    }
    await ready();
    const nudged = await exportProject(), nudgeExpected = nudgePixels.slice(); nudgeExpected[130] = 0; nudgeExpected[170] = objectColor;
    assert(nudged.layers.length === 1 && nudged.layers[0].kind === 'transform' && nudged.layers[0].transform.offset[0] === 40
      && (await exportPNG()).rgba.equals(unpack(nudgeExpected)),
    'Forty physical arrow-key nudges retain one editable transform and restore the lower artwork at intermediate positions');
    await click('undo'); await ready();
    const nudgePrevious = nudgePixels.slice(); nudgePrevious[130] = 0; nudgePrevious[169] = objectColor;
    assert((await exportPNG()).rgba.equals(unpack(nudgePrevious)) && (await exportProject()).layers[0].transform.offset[0] === 39,
      'A coalesced transform still has one complete undo step per individual nudge');
    await click('redo'); await ready(); assert((await exportPNG()).rgba.equals(unpack(nudgeExpected)), 'Redo restores the fortieth nudge without appending another layer');
    await change('paint-tool', 'select-rectangle'); await stroke([[3, 2]]);
    await change('transform-x', 1); await change('transform-y', 0); await click('transform-apply'); await ready();
    const unrelated = await exportProject();
    assert(unrelated.layers.length === 2 && unrelated.layers[0].transform.offset[0] === 40 && unrelated.layers[1].transform.offset[0] === 1,
      'Selecting a different object starts a separate transform instead of modifying the earlier object’s movement');
    await change('paint-tool', 'pencil'); await change('paint-color', '#f4d174', 'input'); await stroke([[8, 6]]);
    await change('paint-tool', 'select-rectangle'); await stroke([[42, 2]]); await click('transform-apply'); await ready();
    const afterInk = await exportProject();
    assert(afterInk.layers.length === 4 && afterInk.layers[2].kind === 'paint' && afterInk.layers[3].kind === 'transform'
      && afterInk.layers[0].transform.offset[0] === 40,
    'An intervening paint layer prevents later translations from being folded into an earlier transform');

    const budgetPixels = Array(64).fill(0); budgetPixels[18] = color(230, 90, 40);
    await upload('full-layer-budget.json', documentFixture('Full layer budget', 8, 8, budgetPixels, {
      selection: Array.from({ length: 64 }, (_, i) => Number(i === 18)),
      layers: Array.from({ length: 32 }, (_, i) => ({ kind: 'paint', id: `paint-${i}`, name: `Ink ${i}`, indices: [], pixels: [] })),
    }));
    await change('paint-tool', 'move'); await stroke([[2, 2], [3, 2]], { allowError: true });
    assert((await readCanvas()).rgba.equals(unpack(budgetPixels)) && (await exportPNG()).rgba.equals(unpack(budgetPixels))
      && (await exportProject()).layers.length === 32,
    'A drag rejected at the layer limit clears its transient preview and leaves both visible and saved artwork unchanged');

    phase = 'editable animation cels and history';
    const aw = 12, ah = 10, firstPixels = Array(aw * ah).fill(0);
    for (let y = 2; y <= 4; y++) for (let x = 2; x <= 4; x++) firstPixels[y * aw + x] = color(225, 57, 43);
    firstPixels[0] = color(29, 63, 91, 0); firstPixels[17] = color(143, 191, 231, 77);
    await upload('animation-start.json', documentFixture('Authored three-cel motion', aw, ah, firstPixels));
    await checked('show-grid', false); await change('paint-tool', 'pencil'); await checked('alpha-lock', false);
    await click('duplicate-frame'); await ready("document.querySelectorAll('#frame-list button').length===2");
    const duplicated = await exportProject(), frameIds = duplicated.frames.map(frame => frame.id);
    assert(duplicated.schema === 'poku-pixel-art/v3' && duplicated.activeFrameId === frameIds[1]
      && isDeepStrictEqual(duplicated.frames[0].document, duplicated.frames[1].document) && (await exportPNG()).rgba.equals(unpack(firstPixels)),
    'Duplicating a still image creates independent editable v3 cels with identical native artwork');
    const defaultSheet = await exportSheet();
    assert(defaultSheet.manifest.frames.length === 2 && defaultSheet.manifest.columns <= 2,
      'A new two-frame animation exports immediately with the default sheet-column controls');
    await change('paint-color', '#2ac46d', 'input'); await stroke([[6, 4], [7, 4]]);
    const secondPixels = firstPixels.slice(); secondPixels[54] = secondPixels[55] = color(42, 196, 109);
    assert((await exportPNG()).rgba.equals(unpack(secondPixels)), 'Painting the duplicated cel changes the actual second-frame artwork');
    await chooseFrame(0);
    assert((await exportPNG()).rgba.equals(unpack(firstPixels)), 'Switching to the first cel proves duplicate painting did not mutate its source');
    await change('frame-duration', 120); await change('frame-name', 'Start');
    await chooseFrame(1); await change('frame-duration', 180); await change('frame-name', 'Sweep');
    assert((await exportPNG()).rgba.equals(unpack(secondPixels)), 'Switching back retains the complete edited second cel');
    await click('duplicate-frame'); await ready("document.querySelectorAll('#frame-list button').length===3");
    await change('frame-duration', 240); await change('frame-name', 'Finish');
    await change('paint-color', '#4874df', 'input'); await stroke([[8, 6], [9, 6]]);
    const thirdPixels = secondPixels.slice(); thirdPixels[80] = thirdPixels[81] = color(72, 116, 223);
    const authoredFrames = [firstPixels, secondPixels, thirdPixels], authored = await exportProject();
    assert(isDeepStrictEqual(authored.frames.map(frame => frame.durationMs), [120, 180, 240])
      && isDeepStrictEqual(authored.frames.map(frame => frame.name), ['Start', 'Sweep', 'Finish']) && (await exportPNG()).rgba.equals(unpack(thirdPixels)),
    'Per-cel names, unequal durations and independently authored pixel layers are saved in the v3 project');
    const orderedIds = authored.frames.map(frame => frame.id);
    await click('frame-left'); await ready();
    assert(isDeepStrictEqual((await exportProject()).frames.map(frame => frame.id), [orderedIds[0], orderedIds[2], orderedIds[1]]), 'Frame-order controls move the selected cel without losing its identity');
    await click('undo'); await ready();
    assert(isDeepStrictEqual((await exportProject()).frames.map(frame => frame.id), orderedIds), 'Animation undo restores the original cel order');
    await click('add-frame'); await ready();
    assert((await exportProject()).frames.length === 4 && alpha((await exportPNG()).rgba).every(v => v === 0), 'Adding a cel creates a blank editable frame at the same native dimensions');
    await click('remove-frame'); await ready();
    assert((await exportProject()).frames.length === 3, 'Deleting the blank cel preserves the other three frames');

    phase = 'onion preview and exact animation exports';
    await chooseFrame(1); await checked('onion-skin', true); await checked('show-grid', true);
    await change('paint-tool', 'select-rectangle'); await stroke([[2, 2], [4, 4]]);
    const onion = await readCanvas('.onion-overlay');
    assert(alpha(onion.rgba).some(a => a > 0) && (await exportPNG()).rgba.equals(unpack(secondPixels)),
      'Neighbor cels appear on an independent onion canvas while native PNG output excludes ghosts, selection and grid');
    await change('animation-direction', 'pingpong'); await checked('animation-loop', true);
    await change('sheet-columns', 2); await change('sheet-padding', 1);
    const sheet = await exportSheet(), manifest = sheet.manifest;
    assert(manifest.schema === 'poku-pixel-art-atlas/v1' && manifest.frameWidth === aw && manifest.frameHeight === ah
      && isDeepStrictEqual(manifest.sequence, [0, 1, 2, 1]) && isDeepStrictEqual(manifest.startsMs, [0, 120, 300, 540])
      && manifest.durationMs === 720 && manifest.loop && manifest.direction === 'pingpong',
    'Sheet JSON records the authored ping-pong order and exact unequal-duration boundaries');
    assert(sheet.png.width === 28 && sheet.png.height === 24 && manifest.frames.every((frame, i) =>
      crop(sheet.png.rgba, sheet.png.width, frame.x, frame.y, frame.width, frame.height).equals(unpack(authoredFrames[i]))),
    'Every decoded sheet cell equals its independently authored native frame bytes, including hidden RGB and partial alpha');
    const occupiedCells = new Set();
    for (const frame of manifest.frames) for (let y = frame.y; y < frame.y + ah; y++) for (let x = frame.x; x < frame.x + aw; x++) occupiedCells.add(y * sheet.png.width + x);
    assert(Array.from({ length: sheet.png.width * sheet.png.height }, (_, i) => i).every(i => occupiedCells.has(i) || sheet.png.rgba.subarray(i * 4, i * 4 + 4).every(v => v === 0)),
      'Atlas padding and unused grid cells stay transparent instead of inheriting editor overlays');
    const clip = JSON.parse((await exportFile('save-animation-clip', '.sprite-clip.json')).bytes.toString('utf8'));
    assert(clip.version === 1 && clip.width === aw && clip.height === ah && clip.frames.length === 4
      && isDeepStrictEqual(clip.frames.map(frame => frame.durationMs), [120, 180, 240, 180])
      && clip.frames.every((frame, i) => decodeRuns(frame).equals(unpack(authoredFrames[[0, 1, 2, 1][i]])))
      && clip.source.direction === 'pingpong' && clip.source.loop,
    'The runtime SpriteClip RLE decodes to the same native cels and explicitly includes the ping-pong return leg');
    const animationSaved = await exportProject(); await upload('animation-reopened.json', animationSaved);
    assert(isDeepStrictEqual((await exportProject()), animationSaved) && (await exportPNG()).rgba.equals(unpack(secondPixels)),
      'The v3 file picker round trip retains all cels, active selection, names, durations, playback settings and editable layers');

    phase = 'actual animation playback';
    await evaluate(() => {
      window.__proPlayback = [];
      window.__proPlaybackObserver = new MutationObserver(() => {
        const value = Number(document.getElementById('animation-playhead').textContent.split('/')[0].trim());
        if (Number.isFinite(value) && window.__proPlayback.at(-1) !== value) window.__proPlayback.push(value);
      });
      window.__proPlaybackObserver.observe(document.getElementById('animation-playhead'), { childList: true, characterData: true, subtree: true });
    });
    await click('play-animation');
    const playbackSequence = [1, 2, 3, 2, 1];
    // Playback follows wall-clock time, so a delayed initial RAF may begin mid-cel.
    // Require a complete visible cycle rather than assuming the first callback is on time.
    await waitFor(`window.__proPlayback.some((_,start)=>${JSON.stringify(playbackSequence)}.every((value,i)=>window.__proPlayback[start+i]===value))`, 5000);
    const observed = await evaluate(() => { window.__proPlaybackObserver.disconnect(); return window.__proPlayback.slice(); });
    await click('play-animation'); await ready();
    assert(observed.some((_, start) => isDeepStrictEqual(observed.slice(start, start + playbackSequence.length), playbackSequence)),
      'Real requestAnimationFrame playback visits forward, return and wrap cels in the visible ping-pong order');
    const shortFrames = [color(241, 31, 17), color(27, 229, 77), color(51, 83, 239)];
    const shortAnimation = { schema: 'poku-pixel-art/v3', name: 'Short non-loop terminal cel', width: 2, height: 2, activeFrameId: 'short-1', loop: false, direction: 'forward',
      frames: shortFrames.map((c, i) => ({ id: `short-${i + 1}`, name: `Short ${i + 1}`, durationMs: 1, document: documentFixture(`Short ${i + 1}`, 2, 2, Array(4).fill(c)) })) };
    await upload('short-nonloop.json', shortAnimation); await click('play-animation');
    await waitFor("document.getElementById('play-animation').getAttribute('aria-pressed')==='false'");
    assert((await readCanvas('#animation-preview')).rgba.equals(unpack(Array(4).fill(shortFrames[2])))
      && await evaluate("document.getElementById('animation-playhead').textContent.trim().startsWith('3 / 3')"),
    'Non-loop playback displays its final cel and valid playhead even when a whole 3ms animation fits between browser frames');
    await upload('animation-for-palette.json', animationSaved);

    phase = 'shared palette across independently authored frames';
    await change('palette-count', 3); await click('extract-animation-palette'); await ready();
    const paletteValues = await evaluate(() => [...document.querySelectorAll('#workbench-palette input')].map(input => input.value));
    const paletteRGB = new Set(paletteValues.map(value => { const n = Number.parseInt(value.slice(1), 16); return color(n >>> 16, n >>> 8 & 255, n & 255) & 0xffffff; }));
    assert(paletteValues.length === 3 && isDeepStrictEqual((await exportProject()), animationSaved)
      && await evaluate("document.getElementById('palette-note').textContent.includes('3개 프레임')"),
    'Common-palette extraction considers every frame and leaves the animation artwork unchanged until application');
    await change('palette-dither', 'none'); await click('apply-animation-palette'); await ready();
    const commonSaved = await exportProject();
    assert(commonSaved.frames.every(frame => frame.document.layers.at(-1).kind === 'palette')
      && commonSaved.frames.every(frame => isDeepStrictEqual(frame.document.layers.at(-1).palette, commonSaved.frames[0].document.layers.at(-1).palette)),
    'Applying the common palette adds the same editable palette layer to every cel');
    const commonFrames = [];
    for (let i = 0; i < 3; i++) {
      await chooseFrame(i); const png = await exportPNG(); commonFrames.push(png.rgba);
      assert(alpha(png.rgba).equals(alpha(unpack(authoredFrames[i]))) && Array.from({ length: aw * ah }, (_, j) => j).every(j => !png.rgba[j * 4 + 3]
        || paletteRGB.has(png.rgba[j * 4] | png.rgba[j * 4 + 1] << 8 | png.rgba[j * 4 + 2] << 16)),
      `Shared-palette cel ${i + 1} uses only selected colors while preserving every authored alpha byte`);
    }
    assert(isDeepStrictEqual(pixel(commonFrames[0], aw, 2, 2), pixel(commonFrames[1], aw, 2, 2))
      && isDeepStrictEqual(pixel(commonFrames[1], aw, 2, 2), pixel(commonFrames[2], aw, 2, 2)),
    'An unchanged color remains exactly the same across frames after common-palette mapping');

    phase = 'layout and visible evidence';
    if (process.env.PIXEL_ART_PRO_SCREENSHOT_PATH) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1680, deviceScaleFactor: 1, mobile: false });
      await change('shape', 'blade'); await change('zoom', 'auto'); await change('view', 'color');
      await click('apply-material'); await ready(); await click('duplicate-frame'); await ready();
      await change('transform-x', 1); await change('transform-y', 0); await click('transform-apply'); await ready();
      await click('duplicate-frame'); await ready(); await click('transform-apply'); await ready();
      await chooseFrame(1); await checked('onion-skin', true); await checked('show-grid', false); await change('paint-tool', 'inspect');
      await evaluate('scrollTo(0,0)'); await painted();
      await mkdir(dirname(process.env.PIXEL_ART_PRO_SCREENSHOT_PATH), { recursive: true });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.env.PIXEL_ART_PRO_SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: true });
    await ready();
    const mobile = await evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      panels: [...document.querySelectorAll('.transform-panel,.animation-workbench,.animation-player,.paint-toolbar,.palette-workbench')].map(p => ({ width: p.getBoundingClientRect().width, right: p.getBoundingClientRect().right })) }));
    assert(mobile.document <= mobile.viewport + 1 && mobile.panels.every(p => p.width > 0 && p.right <= mobile.viewport + 1),
      'Selection transforms and animation controls remain inside a 390px viewport with scrollable frame cards');
    assert(!(await evaluate('window.__pokuUnhandled')).length && !browser.exceptions.length,
      'Selection, transforms, shade brushes, timelines and file exports produce no uncaught browser exceptions');
    return { status: 'passed', checks, mobile,
      selection: { width: w, height: h, transformedRGBA_SHA256: digest(rotated.rgba), layerCount: rotatedProject.layers.length },
      shade: { width: 6, height: 2, rgbaSHA256: digest(afterShade.rgba), rawAlpha: 128, displayedAlpha: 64 },
      animation: { width: aw, height: ah, frames: 3, durationsMs: [120, 180, 240], observedPlayback: observed,
        sheet: { width: sheet.png.width, height: sheet.png.height, rgbaSHA256: digest(sheet.png.rgba) }, commonPalette: paletteValues },
      scope: 'Actual bundled DOM controls, physical CDP pointer gestures, real browser playback, file inputs and decoded export bytes. Native pixel/alpha preservation, independent editable cels, common palettes and responsive layout; no aesthetic or hardware GPU performance certification.' };
  });
} catch (error) {
  report = { status: error instanceof BrowserUnavailable ? 'unavailable' : 'failed', phase, reason: String(error), checks };
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
if (process.env.PIXEL_ART_PRO_REPORT_PATH) {
  await mkdir(dirname(process.env.PIXEL_ART_PRO_REPORT_PATH), { recursive: true });
  await writeFile(process.env.PIXEL_ART_PRO_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
}
if (report.status === 'failed' || process.env.PIXEL_ART_PRO_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
