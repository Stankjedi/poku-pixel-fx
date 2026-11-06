import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';

const checks = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const color = (r, g, b, a = 255) => (r | g << 8 | b << 16 | a << 24) >>> 0;
const pixel = (rgba, w, x, y) => [...rgba.subarray((y * w + x) * 4, (y * w + x + 1) * 4)];
const occupied = rgba => { let count = 0; for (let i = 3; i < rgba.length; i += 4) if (rgba[i]) count++; return count; };
const colors = rgba => {
  const found = new Set();
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) found.add(rgba[i] | rgba[i + 1] << 8 | rgba[i + 2] << 16);
  return found;
};
const alpha = rgba => Buffer.from(Array.from({ length: rgba.length / 4 }, (_, i) => rgba[i * 4 + 3]));
const unpack = (pixels, mask) => {
  const bytes = Buffer.alloc(pixels.length * 4);
  pixels.forEach((c, i) => bytes.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, mask && !mask[i] ? 0 : c >>> 24], i * 4));
  return bytes;
};

const temporary = await mkdtemp(join(tmpdir(), 'poku-pixel-workbench-qa-'));
let report;
try {
  report = await withHarnessBrowser(async browser => {
    const { evaluate, waitFor, send } = browser;
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const painted = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    const ready = async (predicate = 'true') => {
      await waitFor("document.getElementById('result')?.dataset.ready==='true'");
      await painted();
      await waitFor(`(()=>{const s=document.getElementById('status');if(s?.classList.contains('error'))throw new Error(s.textContent);return document.getElementById('result')?.dataset.ready==='true'&&(${predicate});})()`);
    };
    const change = async (id, value, event = 'change') => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
      await ready();
    };
    const checked = async (id, value) => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(e.checked!==${Boolean(value)})e.click();})()`);
      await ready();
    };
    const readCanvas = async () => {
      const raw = await evaluate(() => {
        const c = document.getElementById('result'), bytes = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
        let binary = ''; for (let i = 0; i < bytes.length; i += 16384) binary += String.fromCharCode(...bytes.subarray(i, i + 16384));
        return { width: c.width, height: c.height, base64: btoa(binary) };
      });
      return { width: raw.width, height: raw.height, rgba: Buffer.from(raw.base64, 'base64') };
    };
    const exportFile = async (control, suffix) => {
      const selector = `#downloads a[download$="${suffix}"]`, expression = `document.querySelector(${JSON.stringify(selector)})`;
      const before = await evaluate(`${expression}?.href??''`);
      await click(control);
      await waitFor(`(()=>{const a=${expression},s=document.getElementById('status');if(s?.classList.contains('error'))throw new Error(s.textContent);return a&&a.href!==${JSON.stringify(before)};})()`);
      const file = await evaluate(`(async()=>{const a=${expression},bytes=new Uint8Array(await(await fetch(a.href)).arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return{name:a.download,base64:btoa(binary)};})()`);
      return { name: file.name, bytes: Buffer.from(file.base64, 'base64') };
    };
    const exportPNG = async (control = 'save-png', suffix = '.png') => {
      const file = await exportFile(control, suffix), decoded = decodePNG(file.bytes);
      return { ...decoded, name: file.name, rgba: Buffer.from(decoded.rgba) };
    };
    const exportProject = async () => JSON.parse((await exportFile('save-project', '.poku-pixel-art.json')).bytes.toString('utf8'));
    const uploadPath = async (id, path) => {
      const dom = await send('DOM.getDocument'), node = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: `#${id}` });
      if (!node.nodeId) throw new Error(`Missing ${id} upload input`);
      await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [path] });
      await waitFor(`document.getElementById(${JSON.stringify(id)}).value===''`); await ready();
    };
    const upload = async (name, document) => {
      const path = join(temporary, name); await writeFile(path, JSON.stringify(document));
      await uploadPath('project-file', path);
    };
    const stroke = async points => {
      await evaluate("document.getElementById('result').scrollIntoView({block:'center',inline:'center'})"); await painted();
      const screen = await evaluate(`(()=>{const c=document.getElementById('result'),r=c.getBoundingClientRect();return ${JSON.stringify(points)}.map(([x,y])=>({x:r.left+(x+.5)*r.width/c.width,y:r.top+(y+.5)*r.height/c.height}));})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...screen[0], button: 'none', buttons: 0 });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...screen[0], button: 'left', buttons: 1, clickCount: 1 });
      for (const p of screen.slice(1)) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...p, button: 'left', buttons: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...screen.at(-1), button: 'left', buttons: 0, clickCount: 1 });
      await ready();
    };
    const layerButton = async (id, action) => {
      await evaluate(`(()=>{const row=[...document.querySelectorAll('#layer-list li')].find(row=>row.dataset.layerId===${JSON.stringify(id)});const button=[...row.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')?.endsWith(${JSON.stringify(' ' + action)}));if(!button||button.disabled)throw new Error('Layer action unavailable: '+${JSON.stringify(action)});button.click();})()`);
      await ready();
    };

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1.5, mobile: false });
    await browser.navigate('/gallery/pixel-art-lab.html'); await ready();
    await evaluate(() => document.fonts.ready.then(() => true));
    const initialArtwork = await readCanvas();
    await change('new-width', 16); await change('new-height', 16); await click('new-canvas');
    await ready("document.getElementById('result').width===16&&document.getElementById('layer-count').textContent==='0'");
    await change('zoom', '8');
    const blank = await readCanvas();
    assert(blank.width === 16 && blank.height === 16 && occupied(blank.rgba) === 0
      && await evaluate("document.getElementById('paint-tool').value==='pencil'&&document.getElementById('render-state').textContent==='APPLIED'"),
    'New-canvas controls create an untouched native 16×16 transparent artwork and enable the pencil');
    await click('undo'); await ready();
    const restoredArtwork = await readCanvas();
    assert(restoredArtwork.width === initialArtwork.width && restoredArtwork.height === initialArtwork.height && restoredArtwork.rgba.equals(initialArtwork.rgba),
      'Undoing new-canvas creation restores the previous dimensions and the actual material preview that was visible');
    await click('redo'); await ready();
    assert((await readCanvas()).width === 16 && (await readCanvas()).rgba.equals(blank.rgba),
      'Redoing new-canvas creation restores the transparent 16×16 canvas without carrying old geometry into it');
    const sizing = await evaluate(() => { const c = document.getElementById('result'), r = c.getBoundingClientRect(); return { x: r.width * devicePixelRatio / c.width, y: r.height * devicePixelRatio / c.height, rendering: getComputedStyle(c).imageRendering }; });
    assert(Number.isInteger(sizing.x) && Number.isInteger(sizing.y) && sizing.rendering === 'pixelated',
      'The drawing canvas keeps integer device-pixel cells at fractional 1.5 DPR');

    await change('paint-color', '#e36f45', 'input'); await change('paint-size', 1, 'input');
    await stroke([[2, 3], [12, 3]]);
    const line = await readCanvas();
    assert(occupied(line.rgba) === 11 && Array.from({ length: 11 }, (_, i) => pixel(line.rgba, 16, i + 2, 3)).every(p => isDeepStrictEqual(p, [227, 111, 69, 255]))
      && await evaluate("document.getElementById('layer-count').textContent==='1'"),
    'Two sparse physical pointer events produce all eleven native cells in one paint layer without holes');
    await click('undo'); await ready();
    assert((await readCanvas()).rgba.equals(blank.rgba), 'One undo removes the complete pointer stroke');
    await click('redo'); await ready();
    assert((await readCanvas()).rgba.equals(line.rgba), 'One redo restores the exact complete pointer stroke');

    await change('paint-symmetry', 'x'); await stroke([[3, 7]]);
    const mirrored = await readCanvas();
    assert(occupied(mirrored.rgba) === 13 && isDeepStrictEqual(pixel(mirrored.rgba, 16, 3, 7), [227, 111, 69, 255])
      && isDeepStrictEqual(pixel(mirrored.rgba, 16, 12, 7), [227, 111, 69, 255]),
    'Actual canvas painting mirrors around the correct half-cell axis of an even 16-cell canvas');
    await change('paint-symmetry', 'none'); await change('paint-tool', 'eraser'); await stroke([[4, 3]]);
    const erased = await readCanvas();
    assert(occupied(erased.rgba) === 12 && pixel(erased.rgba, 16, 4, 3)[3] === 0,
      'The eraser removes native color and coverage without consuming another layer');
    await click('undo'); await ready();
    assert((await readCanvas()).rgba.equals(mirrored.rgba), 'Undo restores the erased pixel and its coverage');
    await click('redo'); await ready();
    assert((await readCanvas()).rgba.equals(erased.rgba), 'Redo reapplies the exact erased result');
    await checked('alpha-lock', true); await change('paint-tool', 'pencil'); await stroke([[0, 0]]);
    assert((await readCanvas()).rgba.equals(erased.rgba), 'Alpha lock prevents painting into the transparent background');
    await checked('alpha-lock', false);

    await change('paint-tool', 'line'); await stroke([[1, 10], [13, 10]]);
    const drawnLine = await readCanvas();
    assert(occupied(drawnLine.rgba) === 25 && Array.from({ length: 13 }, (_, i) => pixel(drawnLine.rgba, 16, i + 1, 10)[3]).every(a => a === 255),
      'The line tool accepts actual drag endpoints and paints a complete native line');
    await click('undo'); await ready();
    assert((await readCanvas()).rgba.equals(erased.rgba), 'One undo removes the dragged shape without touching previous brush work');
    await change('paint-tool', 'rectangle'); await checked('paint-filled', false); await stroke([[4, 9], [10, 13]]);
    const rectangle = await readCanvas();
    assert(occupied(rectangle.rgba) === 32 && pixel(rectangle.rgba, 16, 4, 9)[3] === 255 && pixel(rectangle.rgba, 16, 7, 11)[3] === 0,
      'Rectangle drag paints the inclusive 7×5 outline while leaving its interior empty');
    await click('undo'); await ready();
    await change('paint-tool', 'ellipse'); await checked('paint-filled', true); await stroke([[4, 9], [10, 13]]);
    const ellipse = await readCanvas();
    assert(pixel(ellipse.rgba, 16, 7, 11)[3] === 255 && pixel(ellipse.rgba, 16, 4, 9)[3] === 0
      && pixel(ellipse.rgba, 16, 4, 11)[3] === 255 && pixel(ellipse.rgba, 16, 10, 11)[3] === 255,
    'Filled ellipse drag follows a curved native shape instead of filling the rectangular bounds');
    await click('undo'); await ready(); await checked('paint-filled', false);
    await change('paint-tool', 'picker'); await change('paint-color', '#000000', 'input'); await stroke([[3, 3]]);
    assert(await evaluate("document.getElementById('paint-color').value==='#e36f45'") && (await readCanvas()).rgba.equals(erased.rgba),
      'The eyedropper reads the clicked native color without changing artwork or history');

    await change('paint-tool', 'fill'); await change('paint-color', '#23506f', 'input'); await change('tolerance', 0, 'input');
    await stroke([[0, 0]]);
    const filled = await readCanvas();
    assert(occupied(filled.rgba) === 256 && isDeepStrictEqual(pixel(filled.rgba, 16, 0, 0), [35, 80, 111, 255])
      && isDeepStrictEqual(pixel(filled.rgba, 16, 3, 3), [227, 111, 69, 255])
      && await evaluate("document.getElementById('layer-count').textContent==='1'"),
    'Bucket fill reaches connected transparent background, preserves painted cells, and edits the existing paint layer');
    await click('undo'); await ready();
    assert((await readCanvas()).rgba.equals(erased.rgba), 'Bucket fill is a single reversible edit');
    await click('redo'); await ready();
    assert((await readCanvas()).rgba.equals(filled.rgba), 'Bucket redo is byte-identical to the completed fill');

    await click('new-paint-layer'); await ready();
    await change('paint-color', '#63cb89', 'input'); await stroke([[3, 3]]);
    const topPaint = await readCanvas(), layers = await exportProject(), bottomId = layers.layers[0].id, topId = layers.layers[1].id;
    assert(layers.layers.length === 2 && isDeepStrictEqual(pixel(topPaint.rgba, 16, 3, 3), [99, 203, 137, 255]),
      'A new independent paint layer can override a lower authored pixel');
    await evaluate(`(()=>{const row=[...document.querySelectorAll('#layer-list li')].find(row=>row.dataset.layerId===${JSON.stringify(topId)}),input=row.querySelector('.layer-name');input.value='Emerald accent';input.dispatchEvent(new Event('change',{bubbles:true}));})()`); await ready();
    assert((await exportProject()).layers.find(layer => layer.id === topId).name === 'Emerald accent',
      'Layer name edits are stored in the document through the actual name input');
    await layerButton(topId, '표시 전환');
    assert((await readCanvas()).rgba.equals(filled.rgba), 'Hiding the upper layer reveals the unmodified lower artwork');
    await layerButton(topId, '표시 전환');
    assert((await readCanvas()).rgba.equals(topPaint.rgba), 'Showing the layer restores its authored pixel exactly');
    await layerButton(topId, '아래로');
    const reordered = await exportProject();
    assert((await readCanvas()).rgba.equals(filled.rgba) && reordered.layers[0].id === topId && reordered.layers[1].id === bottomId,
      'Moving a layer down changes compositing order as well as the displayed layer list');
    await layerButton(topId, '위로');
    assert((await readCanvas()).rgba.equals(topPaint.rgba), 'Moving the layer back up restores the same visible result');

    await change('palette-count', 2, 'input'); await click('extract-palette'); await ready();
    assert((await readCanvas()).rgba.equals(topPaint.rgba)
      && await evaluate("document.querySelectorAll('#workbench-palette input').length===2&&document.getElementById('layer-count').textContent==='2'"),
    'Perceptual palette extraction creates two editable swatches without altering pixels or adding an adjustment layer');
    await evaluate(() => [...document.querySelectorAll('#workbench-palette input')].forEach((input, i) => { input.value = i ? '#ffffff' : '#000000'; input.dispatchEvent(new Event('input', { bubbles: true })); }));
    await change('palette-dither', 'none'); await click('apply-palette'); await ready();
    const mapped = await readCanvas();
    assert(!mapped.rgba.equals(topPaint.rgba) && alpha(mapped.rgba).equals(alpha(topPaint.rgba))
      && [...colors(mapped.rgba)].every(c => c === 0 || c === 0xffffff)
      && await evaluate("document.getElementById('layer-count').textContent==='3'"),
    'Applying the edited two-color palette creates a reversible adjustment layer with exact palette colors and original coverage');
    await click('undo'); await ready();
    assert((await readCanvas()).rgba.equals(topPaint.rgba), 'Undoing palette remapping recovers the original authored colors');
    await click('redo'); await ready();
    assert((await readCanvas()).rgba.equals(mapped.rgba), 'Palette redo reproduces the same native raster');

    const saved = await exportProject();
    assert(saved.schema === 'poku-pixel-art/v2' && saved.width === 16 && saved.height === 16
      && saved.pixels.every(c => c === 0) && saved.layers.filter(layer => layer.kind === 'paint').length === 2
      && saved.layers.filter(layer => layer.kind === 'palette').length === 1,
    'The v2 document retains its untouched transparent source and separately stores paint and palette layers');
    await upload('roundtrip.poku-pixel-art.json', saved);
    assert((await readCanvas()).rgba.equals(mapped.rgba) && isDeepStrictEqual(await exportProject(), saved),
      'A v2 document opened through the real file input reproduces both its pixels and serialized edit state');
    await checked('show-grid', true); await checked('tile-preview', true);
    const tiledPNG = await exportPNG();
    assert(tiledPNG.width === 16 && tiledPNG.height === 16 && tiledPNG.rgba.equals(mapped.rgba)
      && await evaluate("document.querySelector('.tile-proof.visible canvas').width===48"),
    'Pixel grid and the 3×3 tile proof remain display overlays; native PNG stays at the authored dimensions and pixels');
    await checked('show-grid', false); await checked('tile-preview', false);

    // Hand-written source bytes bypass Canvas/image decoders, which are allowed to quantize low-alpha RGB.
    // The independent expectation is simple replacement data, not the implementation's render function.
    const rawPixels = [
      color(17, 83, 149, 1), color(29, 101, 197, 7), color(41, 127, 211, 31), color(59, 137, 223, 63), color(71, 139, 227),
      color(13, 47, 113, 127), color(89, 163, 239, 128), color(101, 179, 251, 191), color(109, 181, 233, 254), color(127, 193, 229),
      color(137, 199, 227), color(149, 211, 223), color(157, 217, 211), color(163, 223, 199), color(179, 229, 193),
    ];
    const rawMask = Array(rawPixels.length).fill(1); rawMask[4] = 0;
    const exactFixture = { schema: 'poku-pixel-art/v2', name: 'Exact straight alpha', width: 5, height: 3,
      pixels: rawPixels, mask: rawMask, layers: [{ kind: 'paint', id: 'alpha-detail', name: 'Exact alpha accents', indices: [2, 7], pixels: [color(23, 91, 173, 19), color(107, 193, 237, 193)] }], activeLayerId: 'alpha-detail' };
    const expectedPixels = rawPixels.slice(); exactFixture.layers[0].indices.forEach((i, j) => { expectedPixels[i] = exactFixture.layers[0].pixels[j]; });
    const exactBytes = unpack(expectedPixels, rawMask);
    await upload('straight-alpha.poku-pixel-art.json', exactFixture);
    const exactPNG = await exportPNG(), exactSaved = await exportProject();
    assert(exactPNG.width === 5 && exactPNG.height === 3 && exactPNG.rgba.equals(exactBytes)
      && isDeepStrictEqual(exactSaved.pixels, rawPixels) && isDeepStrictEqual(exactSaved.mask, rawMask),
    'Native PNG preserves non-endpoint RGB at alpha 1/7/19/63/127/128/193/254 and hidden RGB from original v2 data without Canvas premultiplication loss');
    await change('view', 'normal'); await change('zoom', '2');
    assert((await exportPNG()).rgba.equals(exactBytes), 'Diagnostic view and display zoom cannot contaminate exact straight-RGBA PNG export');
    await change('view', 'color');
    await upload('straight-alpha-reopened.poku-pixel-art.json', exactSaved);
    assert((await exportPNG()).rgba.equals(exactBytes) && isDeepStrictEqual(await exportProject(), exactSaved),
      'Partial-alpha original and painted pixels survive a save/reopen cycle without channel drift');

    const importedPNG = await exportFile('save-png', '.png'), pngPath = join(temporary, 'raw-alpha-reimport.png');
    await writeFile(pngPath, importedPNG.bytes); await uploadPath('png-file', pngPath);
    const pngProject = await exportProject(), pngSource = Array.from({ length: exactBytes.length / 4 }, (_, i) => color(...exactBytes.subarray(i * 4, i * 4 + 4)));
    assert(pngProject.layers.length === 0 && isDeepStrictEqual(pngProject.pixels, pngSource)
      && (pngProject.pixels[4] & 0xffffff) !== 0 && pngProject.pixels[4] >>> 24 === 0
      && (await exportPNG()).rgba.equals(exactBytes)
      && await evaluate("document.getElementById('import-note').textContent.includes('그대로')"),
    'The actual PNG file input preserves low-alpha and hidden RGB bytes from an exported PNG instead of round-tripping through Canvas');

    const halfFixture = { schema: 'poku-pixel-art/v2', name: 'Half-opacity authored ink', width: 4, height: 2, pixels: Array(8).fill(0),
      layers: [{ kind: 'paint', id: 'half-ink', name: 'Half-opacity ink', opacity: .5, indices: [0, 1], pixels: [color(23, 71, 137, 128), color(43, 101, 173, 63)] }], activeLayerId: 'half-ink' };
    await upload('half-opacity.poku-pixel-art.json', halfFixture);
    const halfBefore = await exportPNG();
    await change('paint-tool', 'pencil'); await change('paint-color', '#bfe67c', 'input'); await checked('alpha-lock', true); await stroke([[0, 0]]);
    const halfAfter = await exportPNG(), halfSaved = await exportProject(), halfLayer = halfSaved.layers[0];
    assert(halfLayer.opacity === .5 && halfLayer.pixels[0] >>> 24 === 128 && (halfLayer.pixels[0] & 0xffffff) === (color(191, 230, 124) & 0xffffff)
      && alpha(halfAfter.rgba).equals(alpha(halfBefore.rgba)) && isDeepStrictEqual(pixel(halfAfter.rgba, 4, 0, 0), [191, 230, 124, 64])
      && halfSaved.pixels.every(c => c === 0),
    'Alpha-locked recoloring edits the raw 128-alpha layer while preserving its 50% opacity and 64-alpha visible result, without applying opacity twice');
    await upload('half-opacity-reopened.poku-pixel-art.json', halfSaved);
    assert((await exportPNG()).rgba.equals(halfAfter.rgba), 'Reopening the edited half-opacity layer preserves its raw and visible coverage');
    await checked('alpha-lock', false);

    const baseColor = color(81, 114, 148), eraseFixture = { schema: 'poku-pixel-art/v2', name: 'Erase original under sparse paint', width: 6, height: 2,
      pixels: Array(12).fill(baseColor), layers: [] };
    await upload('erase-source.poku-pixel-art.json', eraseFixture);
    await change('paint-tool', 'pencil'); await stroke([[0, 0]]);
    await change('paint-tool', 'eraser'); await stroke([[4, 0]]);
    const erasedOriginal = await exportProject(), erasure = erasedOriginal.layers[0], eraseSlot = erasure.indices.indexOf(4);
    assert(eraseSlot >= 0 && erasure.pixels[eraseSlot] === 0 && pixel((await exportPNG()).rgba, 6, 4, 0)[3] === 0
      && erasedOriginal.pixels.every(c => c === baseColor),
    'Erasing an original cell outside the active sparse paint entries records a deliberate zero override and leaves the original source intact');
    await click('undo'); await ready();
    assert(isDeepStrictEqual(pixel((await exportPNG()).rgba, 6, 4, 0), [81, 114, 148, 255]),
      'Undoing a sparse erasure restores the original artwork under the edit layer');
    await click('redo'); await ready();

    // Saving by a control while a pointer is still held must flush the final complete stroke.
    await change('paint-tool', 'pencil');
    await evaluate("document.getElementById('result').scrollIntoView({block:'center',inline:'center'})"); await painted();
    const held = await evaluate(() => { const c = document.getElementById('result'), r = c.getBoundingClientRect(); return [[1, 1], [4, 1]].map(([x, y]) => ({ x: r.left + (x + .5) * r.width / c.width, y: r.top + (y + .5) * r.height / c.height })); });
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...held[0], button: 'left', buttons: 1, clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...held[1], button: 'left', buttons: 1 }); await ready();
    const heldPreview = await readCanvas(), heldSaved = await exportProject();
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...held[1], button: 'left', buttons: 0, clickCount: 1 }); await ready();
    assert((await exportPNG()).rgba.equals(heldPreview.rgba)
      && [7, 8, 9, 10].every(i => heldSaved.layers[0].indices.includes(i)),
    'Saving while a stroke is held commits every interpolated preview cell before serializing, without losing the pointer endpoint');

    // Analytic plane: dh/dx=.5, dh/dy=1, hence normalized interior normal=(-1/3,-2/3,2/3).
    const mw = 8, mh = 8, heights = Array.from({ length: mw * mh }, (_, i) => (i % mw - 3) * .5 + (Math.floor(i / mw) - 3));
    const mapPixels = Array(mw * mh).fill(color(63, 117, 171)); mapPixels[4 * mw + 4] = color(79, 131, 181, 69);
    const mapFixture = { schema: 'poku-pixel-art/v2', name: 'Authored plane', width: mw, height: mh, pixels: mapPixels,
      authoredHeight: heights, layers: [{ kind: 'material', id: 'form', name: 'Analytic authored form',
        material: { kind: 'stone', seed: 3, palette: ['#25415b', '#608a9b', '#e8d9bc'], detail: 0, relief: 0, bevel: 0, light: [0, 0, 1] }, height: heights }] };
    await upload('authored-plane.poku-pixel-art.json', mapFixture);
    await ready("!document.getElementById('save-normal').disabled&&!document.getElementById('save-map-info').disabled");
    const mapSaved = await exportProject();
    await change('normal-convention', 'opengl');
    const gl = await exportPNG('save-normal', '-normal-opengl.png');
    const glInfo = JSON.parse((await exportFile('save-map-info', '-surface-maps.json')).bytes.toString('utf8'));
    await change('normal-convention', 'directx');
    const dx = await exportPNG('save-normal', '-normal-directx.png');
    const dxInfo = JSON.parse((await exportFile('save-map-info', '-surface-maps.json')).bytes.toString('utf8'));
    const ngl = pixel(gl.rgba, mw, 3, 3), ndx = pixel(dx.rgba, mw, 3, 3);
    assert(gl.width === mw && gl.height === mh && dx.width === mw && dx.height === mh
      && Math.abs(ngl[0] - 85) <= 1 && Math.abs(ngl[1] - 213) <= 1 && Math.abs(ngl[2] - 213) <= 1
      && ndx[0] === ngl[0] && ndx[2] === ngl[2] && ndx[1] + ngl[1] === 255,
    'Normal downloads agree with the independently authored plane slope; OpenGL and DirectX invert only the green axis');
    assert(alpha(gl.rgba).equals(alpha(unpack(mapPixels))) && alpha(dx.rgba).equals(alpha(unpack(mapPixels)))
      && pixel(gl.rgba, mw, 4, 4)[3] === 69,
    'Both normal conventions preserve exact source coverage, including a nontrivial partial-alpha cell');
    const heightPNG = await exportPNG('save-height', '-height.png'), aoPNG = await exportPNG('save-occlusion', '-occlusion.png'), shadowPNG = await exportPNG('save-shadow', '-shadow.png');
    const low = Math.min(...heights), high = Math.max(...heights);
    assert(heights.every((value, i) => {
      const expected = Math.round((value - low) / (high - low) * 255), actual = pixel(heightPNG.rgba, mw, i % mw, Math.floor(i / mw));
      return actual[0] === expected && actual[1] === expected && actual[2] === expected && actual[3] === (mapPixels[i] >>> 24);
    }), 'Height PNG encodes explicit saved native heights into the advertised 8-bit range, with exact coverage');
    assert([...colors(aoPNG.rgba)].every(c => c === 0xffffff) && [...colors(shadowPNG.rgba)].every(c => c === 0xffffff)
      && alpha(aoPNG.rgba).equals(alpha(unpack(mapPixels))) && alpha(shadowPNG.rgba).equals(alpha(unpack(mapPixels))),
    'A tilted plane has no false ambient cavity or shadow under overhead light, and visibility PNGs retain partial alpha');
    assert(glInfo.schema === 'poku-pixel-surface-maps/v1' && glInfo.normalConvention === 'opengl' && dxInfo.normalConvention === 'directx'
      && glInfo.width === mw && glInfo.height === mh && isDeepStrictEqual(glInfo.heightRange, [low, high])
      && isDeepStrictEqual(dxInfo.heightRange, [low, high]) && glInfo.heightUnits === 'native pixel units' && glInfo.heightEncoding.includes('8-bit')
      && glInfo.geometry.includes('authored') && isDeepStrictEqual((await exportProject()), mapSaved),
    'Surface-map JSON describes actual dimensions, convention, native units and height range without mutating the authored project');

    await layerButton('form', '재질 수정'); await checked('use-height', false);
    await click('apply-material'); await ready();
    const heightOff = await exportProject(), flatHeight = await exportPNG('save-height', '-height.png');
    assert(!Object.hasOwn(heightOff.layers.find(layer => layer.id === 'form'), 'height')
      && [...colors(flatHeight.rgba)].every(c => c === 0) && alpha(flatHeight.rgba).equals(alpha(heightPNG.rgba)),
    'Editing an existing material can turn authored height OFF, remove the layer height field, and export flat geometry with unchanged coverage');
    await click('undo'); await ready();
    assert((await exportPNG('save-height', '-height.png')).rgba.equals(heightPNG.rgba),
      'Undo restores the material’s original authored geometry after turning height off');

    if (process.env.PIXEL_WORKBENCH_SCREENSHOT_PATH) {
      await change('shape', 'stone-path'); await change('zoom', 'auto');
      await evaluate('scrollTo(0,0)'); await painted();
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.env.PIXEL_WORKBENCH_SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: true });
    await ready();
    const mobile = await evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
      panels: [...document.querySelectorAll('.art-panel,.inspector,.paint-toolbar,.palette-workbench,.layers')].map(panel => ({ width: panel.getBoundingClientRect().width, right: panel.getBoundingClientRect().right })) }));
    assert(mobile.document <= mobile.viewport + 1 && mobile.body <= mobile.viewport + 1
      && mobile.panels.every(panel => panel.width > 0 && panel.right <= mobile.viewport + 1),
    'The drawing toolbar, palette controls, editable layer rows and inspector stay inside a 390-pixel mobile viewport');
    assert(!(await evaluate('window.__pokuUnhandled')).length && !browser.exceptions.length,
      'Drawing, layers, palette changes, v2 imports, exact PNG and surface-map downloads produce no uncaught browser errors');
    return { status: 'passed', checks, sizing, mobile,
      authored: { width: 16, height: 16, layers: saved.layers.length, rgbaSHA256: digest(mapped.rgba) },
      straightAlpha: { width: exactPNG.width, height: exactPNG.height, rgbaSHA256: digest(exactPNG.rgba) },
      surfaceMaps: { width: mw, height: mh, heightRange: [low, high], normalOpenGL: ngl, normalDirectX: ndx, heightRGBA_SHA256: digest(heightPNG.rgba) },
      scope: 'Actual bundled browser controls and physical pointer events for native painting, history, editable layers, palettes, v2 file round trips, exact straight-RGBA PNG, authored geometry maps and responsive layout. No artistic-quality certification.' };
  });
} catch (error) {
  report = { status: error instanceof BrowserUnavailable ? 'unavailable' : 'failed', reason: String(error), checks };
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
if (process.env.PIXEL_WORKBENCH_REPORT_PATH) await writeFile(process.env.PIXEL_WORKBENCH_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
if (report.status === 'failed' || process.env.PIXEL_WORKBENCH_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
