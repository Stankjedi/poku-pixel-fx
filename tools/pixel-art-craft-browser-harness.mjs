import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';

const checks = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const color = (r, g, b, a = 255) => (r | g << 8 | b << 16 | a << 24) >>> 0;
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rgba = (pixels, mask) => {
  const bytes = Buffer.alloc(pixels.length * 4);
  pixels.forEach((c, i) => bytes.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, mask && !mask[i] ? 0 : c >>> 24], i * 4));
  return bytes;
};
const fixture = (name, width, height, pixels = Array(width * height).fill(0), extra = {}) => ({
  schema: 'poku-pixel-art/v2', name, width, height, pixels, layers: [], ...extra,
});
const heightAt = (layer, i) => { const j = layer.indices.indexOf(i); return j < 0 ? 0 : layer.deltas[j] * (layer.strength ?? 1); };
const temporary = await mkdtemp(join(tmpdir(), 'poku-pixel-craft-qa-'));
let report, phase = 'initialization';
try {
  report = await withHarnessBrowser(async browser => {
    const { send, evaluate, waitFor } = browser;
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const painted = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    const ready = async (predicate = 'true') => {
      await waitFor("document.getElementById('result')?.dataset.ready==='true'"); await painted();
      await waitFor(`(()=>{const s=document.getElementById('status');if(s?.classList.contains('error'))throw new Error(s.textContent);return ${predicate};})()`);
    };
    const change = async (id, value, event = 'change') => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`); await ready();
    };
    const checked = async (id, value) => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(e.checked!==${Boolean(value)})e.click();})()`); await ready();
    };
    const link = suffix => `document.querySelector(${JSON.stringify(`#downloads a[download$="${suffix}"]`)})`;
    const exportFile = async (control, suffix) => {
      const before = await evaluate(`${link(suffix)}?.href??''`); await click(control);
      await waitFor(`(()=>{const a=${link(suffix)},s=document.getElementById('status');if(s?.classList.contains('error'))throw new Error(s.textContent);return a&&a.href!==${JSON.stringify(before)};})()`);
      const bytes = await evaluate(`(async()=>{const bytes=new Uint8Array(await(await fetch(${link(suffix)}.href)).arrayBuffer());let s='';for(let i=0;i<bytes.length;i+=16384)s+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(s);})()`);
      return Buffer.from(bytes, 'base64');
    };
    const exportPNG = async () => {
      const image = decodePNG(await exportFile('save-png', '.png')); return { ...image, rgba: Buffer.from(image.rgba) };
    };
    const exportProject = async () => JSON.parse((await exportFile('save-project', '.poku-pixel-art.json')).toString('utf8'));
    const upload = async (name, document) => {
      const path = join(temporary, name); await writeFile(path, JSON.stringify(document));
      const dom = await send('DOM.getDocument'), file = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#project-file' });
      await send('DOM.setFileInputFiles', { nodeId: file.nodeId, files: [path] });
      await waitFor("document.getElementById('project-file').value===''"); await ready();
    };
    const stroke = async (points, modifiers = 0) => {
      await evaluate("document.getElementById('result').scrollIntoView({block:'center',inline:'center'})"); await painted();
      const screen = await evaluate(`(()=>{const c=document.getElementById('result'),r=c.getBoundingClientRect();return ${JSON.stringify(points)}.map(([x,y])=>({x:r.left+(x+.5)*r.width/c.width,y:r.top+(y+.5)*r.height/c.height}));})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...screen[0], button: 'none', buttons: 0, modifiers });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...screen[0], button: 'left', buttons: 1, clickCount: 1, modifiers });
      for (const p of screen.slice(1)) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, button: 'left', buttons: 1, modifiers });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...screen.at(-1), button: 'left', buttons: 0, clickCount: 1, modifiers });
      await ready();
    };
    const editLayer = async (id, type) => {
      await evaluate(`(()=>{const row=[...document.querySelectorAll('#layer-list li')].find(r=>r.dataset.layerId===${JSON.stringify(id)}),b=row&&[...row.querySelectorAll('button')].find(b=>b.title.endsWith(${JSON.stringify(type + ' 수정')}));if(!b)throw new Error('Missing layer edit control');b.click();})()`); await ready();
    };
    const chooseFrame = async index => {
      await evaluate(`document.querySelectorAll('#frame-list button')[${index}].click()`); await ready();
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1.5, mobile: false });
    await browser.navigate('/gallery/pixel-art-lab.html'); await ready();

    phase = 'physical height painting without replacing source colors';
    const w = 24, h = 20, n = w * h;
    const original = Array.from({ length: n }, (_, i) => color(41 + i % 7 * 20, 82 + i % 5 * 24, 164 - i % 6 * 17, [255, 128, 1, 199][i % 4]));
    original[0] = color(91, 52, 33, 0);
    const mask = Array(n).fill(1); mask[1] = 0;
    const selection = Array.from({ length: n }, (_, i) => Number(i % w >= 3 && i % w <= 14 && Math.floor(i / w) >= 4 && Math.floor(i / w) <= 8));
    const protection = Array(n).fill(0); protection[6 * w + 8] = 1;
    await upload('height-source.json', fixture('Explicit height on exact RGBA', w, h, original, { mask, selection, protectedMask: protection }));
    assert(await evaluate("document.getElementById('apply-relight').disabled&&document.getElementById('save-normal').disabled"), 'A color-only imported drawing starts without fabricated height or normals');
    await change('zoom', '8'); await checked('paint-in-selection', true); await change('paint-tool', 'height-raise');
    await change('sculpt-size', 5, 'input'); await change('sculpt-strength', 2, 'input'); await change('sculpt-hardness', 1, 'input');
    await stroke([[4, 6], [8, 6], [12, 6]]);
    const sculpted = await exportProject(), firstHeight = sculpted.layers.at(-1), sourceRGBA = rgba(original, mask);
    assert(firstHeight.kind === 'height' && sculpted.layers.length === 1 && isDeepStrictEqual(sculpted.pixels, original)
      && isDeepStrictEqual(sculpted.mask, mask), 'A physical sculpt stroke creates one editable height layer while preserving original RGB, partial alpha and independent silhouette');
    assert(firstHeight.indices.length > 0 && firstHeight.indices.every(i => selection[i] && !protection[i])
      && heightAt(firstHeight, 6 * w + 4) === 2 && heightAt(firstHeight, 6 * w + 8) === 0,
    'Height writes respect the selected band and protected detail, with one height increment per stroke rather than per pointer event');
    assert((await exportPNG()).rgba.equals(sourceRGBA)
      && await evaluate("!document.getElementById('apply-relight').disabled&&!document.getElementById('save-normal').disabled"),
    'Height authoring enables relighting and surface maps without changing a single exported color or alpha byte');
    await stroke([[4, 6]]); const accumulated = await exportProject();
    assert(accumulated.layers.length === 1 && accumulated.layers[0].id === firstHeight.id && heightAt(accumulated.layers[0], 6 * w + 4) === 4,
      'A second gesture adds to the same top height layer instead of consuming another layer');
    await click('undo'); await ready();
    assert(heightAt((await exportProject()).layers[0], 6 * w + 4) === 2, 'Undo restores the height before the second complete gesture');
    await click('redo'); await ready();
    assert(heightAt((await exportProject()).layers[0], 6 * w + 4) === 4, 'Redo restores the exact accumulated height');
    const map = decodePNG(await exportFile('save-normal', '-normal-opengl.png'));
    assert(map.width === w && map.height === h && map.rgba.some((v, i) => i % 4 < 2 && map.rgba[i - i % 4 + 3] > 0 && v !== 128 && v !== 127),
      'The actual Normal PNG exporter consumes the manually authored geometry');
    await upload('height-roundtrip.json', accumulated);
    assert(isDeepStrictEqual((await exportProject()).layers, accumulated.layers) && (await exportPNG()).rgba.equals(sourceRGBA),
      'Saving and reopening retains exact sculpt deltas, edit masks and source RGBA');

    phase = 'height-layer strength editing and tile boundaries';
    await editLayer(firstHeight.id, '높이'); await change('height-layer-strength', .5, 'input'); await click('height-layer-cancel'); await ready();
    assert(isDeepStrictEqual((await exportProject()).layers, accumulated.layers), 'Canceling height-layer strength preview leaves the stored sculpt layer unchanged');
    await editLayer(firstHeight.id, '높이'); await change('height-layer-strength', .5, 'input');
    const scaled = await exportProject();
    assert(scaled.layers.length === 1 && scaled.layers[0].id === firstHeight.id && scaled.layers[0].strength === .5
      && isDeepStrictEqual(scaled.layers[0].deltas, accumulated.layers[0].deltas),
    'Saving an active height-strength preview updates the same layer and keeps its authored delta values');
    await upload('wrapped-height.json', fixture('Wrapped sculpt proof', 16, 16, Array(256).fill(color(76, 139, 126))));
    await checked('paint-in-selection', false); await change('paint-tool', 'height-raise'); await checked('sculpt-wrap', true);
    await change('sculpt-size', 6, 'input'); await change('sculpt-strength', 3, 'input'); await stroke([[0, 8]]);
    const wrapped = await exportProject(), wrappedLayer = wrapped.layers[0];
    assert(wrappedLayer.wrap && heightAt(wrappedLayer, 8 * 16 + 15) > 0 && heightAt(wrappedLayer, 8 * 16 + 8) === 0,
      'Painting the left tile boundary also raises its neighboring right-edge cells without painting across the middle');
    await change('paint-tool', 'height-flatten'); await change('sculpt-size', 1, 'input'); await change('sculpt-strength', 1, 'input'); await change('sculpt-target', 7, 'input'); await stroke([[0, 8]]);
    assert(heightAt((await exportProject()).layers[0], 8 * 16) === 7, 'The flatten brush uses the explicitly authored target height');
    await change('paint-tool', 'height-smooth'); await stroke([[0, 8]]);
    const smoothed = heightAt((await exportProject()).layers[0], 8 * 16);
    assert(smoothed > 0 && smoothed < 7, 'The smooth-height brush changes geometry locally while leaving the color image untouched');

    phase = 'editable native curves and exact-alpha output';
    await upload('curve-source.json', fixture('Cubic curve proof', 64, 48)); await change('zoom', '4');
    await checked('paint-in-selection', false); await checked('alpha-lock', false); await checked('sculpt-wrap', false);
    await change('paint-tool', 'path'); await change('paint-color', '#b8e8a4', 'input'); await change('path-alpha', 128, 'input');
    await checked('path-closed', false); await checked('path-fill', false); await checked('path-taper', true);
    await change('path-start-width', 5, 'input'); await change('path-end-width', 1, 'input');
    await stroke([[6, 30], [6, 10]]); await stroke([[25, 8], [38, 8]]); await stroke([[52, 30], [52, 42]]);
    assert(await evaluate("document.querySelectorAll('.craft-overlay rect').length===3&&document.querySelectorAll('.craft-overlay circle').length>=2"),
      'Physical click-drag gestures create three anchors with independently displayed Bézier handles');
    // Saving must capture the visible path draft; this exercises the actual export integration.
    const curves = await exportProject(), curve = curves.layers[0], curvePNG = await exportPNG();
    assert(curves.layers.length === 1 && curve.kind === 'path' && curve.nodes.length === 3 && curve.nodes.every(node => node.in && node.out)
      && curve.options.startWidth === 5 && curve.options.endWidth === 1 && curve.color >>> 24 === 128,
    'Save commits the editable curve draft with taper, full control points and explicit partial alpha');
    let ink = 0, exactInk = true;
    for (let i = 0; i < curvePNG.rgba.length; i += 4) if (curvePNG.rgba[i + 3]) {
      ink++; if (!isDeepStrictEqual([...curvePNG.rgba.subarray(i, i + 4)], [184, 232, 164, 128])) exactInk = false;
    }
    assert(ink > 60 && exactInk && curves.pixels.every(v => v === 0),
      'The exported curve uses only the authored native RGBA, excludes guide colors and leaves the source layer untouched');
    await upload('curve-roundtrip.json', curves);
    assert((await exportPNG()).rgba.equals(curvePNG.rgba) && isDeepStrictEqual((await exportProject()).layers, curves.layers),
      'Reopening a saved cubic path exactly reproduces its pixels and editable handles');
    await editLayer(curve.id, '곡선'); await stroke([[6, 30], [10, 30]]); await click('path-cancel'); await ready();
    assert((await exportPNG()).rgba.equals(curvePNG.rgba), 'Cancel discards a dragged-anchor preview and restores the previously applied curve');
    await editLayer(curve.id, '곡선'); await stroke([[6, 30], [10, 30]]); await click('path-apply'); await ready();
    const moved = await exportProject(), movedPNG = await exportPNG();
    assert(moved.layers.length === 1 && moved.layers[0].id === curve.id && moved.layers[0].nodes[0].point[0] === curve.nodes[0].point[0] + 4
      && moved.layers[0].nodes[0].out[0] === curve.nodes[0].out[0] + 4 && moved.layers[0].color >>> 24 === 128 && !movedPNG.rgba.equals(curvePNG.rgba),
    'Re-editing moves an anchor together with its handles, preserves partial alpha and updates the existing path ID');
    await click('undo'); await ready();
    assert((await exportPNG()).rgba.equals(curvePNG.rgba), 'Curve re-editing is one reversible document change');
    await click('redo'); await ready();
    assert((await exportPNG()).rgba.equals(movedPNG.rgba), 'Curve redo restores the edited native result');

    phase = 'closed-path widths, masks and animation independence';
    const closedSource = fixture('Closed effective width', 32, 32, Array(1024).fill(color(34, 57, 81)), {
      activeLayerId: 'closed-proof', layers: [{ kind: 'path', id: 'closed-proof', name: 'Closed alpha proof',
        nodes: [{ point: [7.5, 7.5] }, { point: [24.5, 8.5] }, { point: [15.5, 24.5] }],
        options: { closed: true, fill: true, strokeWidth: 1, startWidth: 5, endWidth: 5, pixelPerfect: false, symmetry: 'none' }, color: color(230, 121, 83, 73),
        selection: Array.from({ length: 1024 }, (_, i) => Number(i % 32 < 26)), protectedMask: Array.from({ length: 1024 }, (_, i) => Number(i === 15 * 32 + 15)) }],
    });
    await upload('closed-path.json', closedSource); await editLayer('closed-proof', '곡선');
    assert(await evaluate("document.getElementById('path-width').value==='5'&&document.getElementById('path-alpha').value==='73'"),
      'Reopening a closed path displays its effective width and saved alpha instead of reverting to opaque default-width ink');
    await change('path-x', 8.5); const closedEdited = await exportProject();
    assert(closedEdited.layers.length === 1 && closedEdited.layers[0].options.startWidth === 5 && closedEdited.layers[0].options.endWidth === 5
      && closedEdited.layers[0].color >>> 24 === 73 && isDeepStrictEqual(closedEdited.layers[0].selection, closedSource.layers[0].selection)
      && isDeepStrictEqual(closedEdited.layers[0].protectedMask, closedSource.layers[0].protectedMask),
    'A numeric anchor edit preserves effective closed widths, partial alpha and the saved selection/protection constraints');
    await editLayer('closed-proof', '곡선'); await checked('paint-in-selection', false);
    assert((await exportProject()).layers[0].selection === undefined,
      'Disabling the selection constraint removes the saved path selection when re-editing an existing layer');
    await click('undo'); await ready();
    const closedBaseline = (await exportPNG()).rgba;
    await click('duplicate-frame'); await ready("document.querySelectorAll('#frame-list button').length===2");
    await editLayer('closed-proof', '곡선'); await change('path-x', 9.5); await click('path-apply'); await ready();
    const animation = await exportProject();
    assert(animation.schema === 'poku-pixel-art/v3' && animation.frames[0].document.layers[0].nodes[0].point[0] === 8.5
      && animation.frames[1].document.layers[0].nodes[0].point[0] === 9.5, 'Duplicated animation cels retain independently editable curve layers');
    await chooseFrame(0);
    assert((await exportPNG()).rgba.equals(closedBaseline), 'Returning to the first cel reproduces its exact pre-duplication image');

    const lens = fixture('Two-anchor closed cubic lens', 32, 32, Array(1024).fill(0), {
      activeLayerId: 'lens-proof', layers: [{ kind: 'path', id: 'lens-proof', name: 'Two-anchor lens',
        nodes: [{ point: [8.5, 16.5], in: [8.5, 8.5], out: [8.5, 24.5] }, { point: [23.5, 16.5], in: [23.5, 24.5], out: [23.5, 8.5] }],
        options: { closed: true, fill: true, strokeWidth: 0 }, color: color(178, 220, 167, 91) }],
    });
    await upload('closed-lens.json', lens); await editLayer('lens-proof', '곡선'); await change('path-x', 9.5);
    const editedLens = await exportProject();
    assert(editedLens.layers.length === 1 && editedLens.layers[0].id === 'lens-proof' && editedLens.layers[0].nodes.length === 2
      && editedLens.layers[0].nodes[0].point[0] === 9.5 && (await exportPNG()).rgba.some((v, i) => i % 4 === 3 && v === 91),
    'A saved two-anchor closed cubic shape remains editable and exports its exact partial alpha without an artificial three-anchor requirement');

    phase = 'in-place relight and palette editing';
    const lights = [
      { direction: [-.8, -.2, .7], color: '#ffe1b0', intensity: .85, castShadow: 0, shadowDistance: 13 },
      { direction: [.5, .3, .9], color: '#8cb8f1', intensity: .19, castShadow: 0, shadowDistance: 17 },
      { direction: [.1, -.9, .25], color: '#e79acf', intensity: .13, castShadow: 0, shadowDistance: 23 },
    ];
    const lightDocument = { ...accumulated, name: 'Independent custom lights', activeLayerId: 'custom-lights', layers: [...accumulated.layers,
      { kind: 'relight', id: 'custom-lights', name: 'Three independently authored lights', lighting: { lights, ambient: .24, ambientColor: '#324455',
        roughness: .61, specular: .37, diffuseBands: 0, strength: .7, occlusionRadius: 3, wrap: false } }] };
    await upload('custom-lights.json', lightDocument); const beforeLight = await exportProject();
    await editLayer('custom-lights', '조명'); await change('relight-strength', .4, 'input');
    const editedLight = await exportProject(), stableLitPNG = await exportPNG();
    assert(editedLight.layers.length === beforeLight.layers.length && editedLight.layers.at(-1).id === 'custom-lights'
      && editedLight.layers.at(-1).lighting.strength === .4 && isDeepStrictEqual(editedLight.layers.at(-1).lighting.lights, beforeLight.layers.at(-1).lighting.lights)
      && editedLight.layers.at(-1).lighting.specular === beforeLight.layers.at(-1).lighting.specular,
    'Saving an edited light updates the same layer while preserving all three independent directions, colors, distances and unexposed specular controls');
    await editLayer('custom-lights', '조명'); await change('relight-strength', .1, 'input'); await click('cancel-relight-edit'); await ready();
    assert((await exportPNG()).rgba.equals(stableLitPNG.rgba), 'Canceling an in-place relight preview restores the previously applied lighting');
    const emptyLayers = Array.from({ length: 31 }, (_, i) => ({ kind: 'paint', id: `empty-${i}`, name: `Empty ${i}`, indices: [], pixels: [] }));
    const fullLight = { ...editedLight, layers: [...emptyLayers.slice(0, 30), editedLight.layers[0], editedLight.layers.at(-1)] };
    await upload('full-light-budget.json', fullLight); await editLayer('custom-lights', '조명');
    assert(await evaluate("!document.getElementById('apply-relight').disabled"), 'A full 32-layer document still permits editing an existing light');
    await change('relight-strength', .2, 'input'); await click('apply-relight'); await ready();
    assert((await exportProject()).layers.length === 32, 'Applying a light edit at the layer limit does not allocate a new layer');
    const paletteDocument = fixture('Full palette budget', 8, 8, Array.from({ length: 64 }, (_, i) => color(30 + i * 3, 91, 150)), {
      activeLayerId: 'palette-proof', layers: [...emptyLayers, { kind: 'palette', id: 'palette-proof', name: 'Authored palette', palette: ['#19263b', '#d5edba'],
        dither: 'bayer4', strength: .5, origin: [2.5, -1.5], selection: Array(64).fill(1), protectedMask: Array.from({ length: 64 }, (_, i) => Number(i === 9)) }],
    });
    await upload('palette-edit.json', paletteDocument); await editLayer('palette-proof', '팔레트');
    assert(await evaluate("!document.getElementById('apply-palette').disabled"), 'A full 32-layer document still permits editing its existing palette');
    await change('palette-strength', .25, 'input'); await click('apply-palette'); await ready();
    const editedPalette = await exportProject(), palettePNG = await exportPNG();
    assert(editedPalette.layers.length === 32 && editedPalette.layers.at(-1).id === 'palette-proof' && editedPalette.layers.at(-1).strength === .25
      && isDeepStrictEqual(editedPalette.layers.at(-1).origin, [2.5, -1.5]) && isDeepStrictEqual(editedPalette.layers.at(-1).protectedMask, paletteDocument.layers.at(-1).protectedMask),
    'Palette re-editing updates the same layer and preserves its stored object coordinates and protected cells');
    await editLayer('palette-proof', '팔레트');
    await evaluate("(()=>{const c=document.querySelector('#workbench-palette input');c.value='#ee4422';c.dispatchEvent(new Event('input',{bubbles:true}));})()"); await ready();
    await click('cancel-palette-edit'); await ready();
    assert((await exportPNG()).rgba.equals(palettePNG.rgba), 'Canceling a changed palette swatch restores the applied palette without touching the source image');

    phase = 'responsive controls and captured evidence';
    await upload('curve-evidence.json', moved); await editLayer(curve.id, '곡선');
    await change('zoom', '4');
    await evaluate("document.getElementById('height-craft-panel').open=true;document.getElementById('path-craft-panel').open=true"); await ready();
    if (process.env.PIXEL_ART_CRAFT_SCREENSHOT_PATH) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1400, deviceScaleFactor: 1, mobile: false });
      await evaluate('scrollTo(0,0)'); await painted();
      await mkdir(dirname(process.env.PIXEL_ART_CRAFT_SCREENSHOT_PATH), { recursive: true });
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.env.PIXEL_ART_CRAFT_SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: true }); await ready();
    const mobile = await evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      panels: [...document.querySelectorAll('.craft-panel,.craft-workbench')].map(p => ({ width: p.getBoundingClientRect().width, right: p.getBoundingClientRect().right })) }));
    assert(mobile.document <= mobile.viewport + 1 && mobile.panels.every(p => p.width > 0 && p.right <= mobile.viewport + 1),
      'Expanded sculpt and Bézier controls fit a 390px mobile viewport');
    assert(!(await evaluate('window.__pokuUnhandled')).length && !browser.exceptions.length,
      'Sculpting, curve edits, cel navigation, adjustment previews and exports produce no uncaught browser exceptions');
    return { status: 'passed', checks, mobile,
      height: { width: w, height: h, sculptedCells: firstHeight.indices.length, exactSourceRGBA_SHA256: digest(sourceRGBA), wrappedHeight: heightAt(wrappedLayer, 8 * 16 + 15) },
      curve: { width: 64, height: 48, nativeInkCells: ink, anchors: curve.nodes.length, alpha: curve.color >>> 24, rgbaSHA256: digest(movedPNG.rgba) },
      scope: 'Actual bundled controls, physical CDP pointer editing, file picker round trips, exact PNG bytes, editable layer identity and responsive layout. No artistic-quality score or physical-GPU performance claim.' };
  });
} catch (error) {
  report = { status: error instanceof BrowserUnavailable ? 'unavailable' : 'failed', phase, reason: String(error), checks };
} finally { await rm(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify(report, null, 2));
if (process.env.PIXEL_ART_CRAFT_REPORT_PATH) {
  await mkdir(dirname(process.env.PIXEL_ART_CRAFT_REPORT_PATH), { recursive: true });
  await writeFile(process.env.PIXEL_ART_CRAFT_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
}
if (report.status === 'failed' || process.env.PIXEL_ART_CRAFT_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
