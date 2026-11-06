import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';

const checks = [], assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const color = (r, g, b, a = 255) => (r | g << 8 | b << 16 | a << 24) >>> 0;
const rgba = (pixels, mask) => {
  const bytes = Buffer.alloc(pixels.length * 4);
  pixels.forEach((c, i) => bytes.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, !mask || mask[i] ? c >>> 24 : 0], i * 4)); return bytes;
};
const fixture = (name, width, height, pixels = Array(width * height).fill(0), extra = {}) => ({ schema: 'poku-pixel-art/v2', name, width, height, pixels, layers: [], ...extra });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const temporary = await mkdtemp(join(tmpdir(), 'poku-pixel-brush-qa-'));
let phase = 'initialization', report;
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
      const previous = await evaluate(`${link(suffix)}?.href??''`); await click(control);
      await waitFor(`(()=>{const a=${link(suffix)},s=document.getElementById('status');if(s?.classList.contains('error'))throw new Error(s.textContent);return a&&a.href!==${JSON.stringify(previous)};})()`);
      const bytes = await evaluate(`(async()=>{const b=new Uint8Array(await(await fetch(${link(suffix)}.href)).arrayBuffer());let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);})()`); return Buffer.from(bytes, 'base64');
    };
    const exportProject = async () => JSON.parse((await exportFile('save-project', '.poku-pixel-art.json')).toString('utf8'));
    const exportBrush = async () => JSON.parse((await exportFile('cluster-export', '.poku-pixel-brush.json')).toString('utf8'));
    const exportPNG = async () => { const image = decodePNG(await exportFile('save-png', '.png')); return { ...image, rgba: Buffer.from(image.rgba) }; };
    const upload = async (name, document, control = 'project-file') => {
      const path = join(temporary, name); await writeFile(path, JSON.stringify(document));
      const dom = await send('DOM.getDocument'), node = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: `#${control}` });
      await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [path] });
      await waitFor(`document.getElementById(${JSON.stringify(control)}).value===''`); await ready();
    };
    const gesture = async (points, { surface = 'result', modifiers = 0, release = true } = {}) => {
      await evaluate(`document.getElementById(${JSON.stringify(surface)}).scrollIntoView({block:'center',inline:'center'})`); await painted();
      const screen = await evaluate(`(()=>{const c=document.getElementById(${JSON.stringify(surface)}),r=c.getBoundingClientRect(),s=document.getElementById('result'),tile=${surface === 'tile-canvas'};return ${JSON.stringify(points)}.map(([x,y])=>({x:r.left+(x+(tile?s.width:0)+.5)*r.width/c.width,y:r.top+(y+(tile?s.height:0)+.5)*r.height/c.height}));})()`);
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...screen[0], buttons: 0, button: 'none', modifiers });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...screen[0], buttons: 1, button: 'left', clickCount: 1, modifiers });
      for (const point of screen.slice(1)) await send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...point, buttons: 1, button: 'left', modifiers });
      if (release) await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...screen.at(-1), buttons: 0, button: 'left', clickCount: 1, modifiers });
      await ready(); return screen.at(-1);
    };
    const release = point => send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, buttons: 0, button: 'left', clickCount: 1 });
    const undo = async () => { await click('undo'); await ready(); };
    const redo = async () => { await click('redo'); await ready(); };
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1.5, mobile: false });
    await browser.navigate('/gallery/pixel-art-lab.html'); await ready();

    phase = 'using and exporting the authored example brush';
    await upload('example-brush-target.json', fixture('Example brush target', 16, 16)); await change('zoom', 8); await change('paint-tool', 'cluster'); await gesture([[5, 8]]);
    const example = await exportBrush(), examplePNG = await exportPNG();
    assert(example.schema === 'poku-pixel-cluster-brush/v1' && example.width === 5 && example.height === 7 && example.pixels.every(value => value >= 0 && value <= 0xffffffff)
      && (await exportProject()).layers.length === 1 && isDeepStrictEqual([...examplePNG.rgba.subarray((3 * 16 + 7) * 4, (3 * 16 + 7) * 4 + 4)], [55, 109, 99, 255]),
    'The initial hand-authored leaf brush stamps visible native pixels and exports valid unsigned packed colors');

    phase = 'capturing and reopening a multicolor native brush';
    const w = 24, h = 20, background = color(24, 43, 68, 73), raw = Array(w * h).fill(background), mask = Array(w * h).fill(1);
    const motif = [color(224, 91, 55), color(67, 182, 159, 128), color(91, 42, 13, 0), color(173, 224, 91, 1), color(251, 195, 58), color(84, 107, 195, 199)];
    const selection = Array(w * h).fill(0);
    for (let y = 0; y < 2; y++) for (let x = 0; x < 3; x++) {
      const index = (y + 3) * w + x + 2; raw[index] = motif[y * 3 + x]; selection[index] = x === 1 && y === 1 ? 0 : 1;
    }
    mask[4 * w + 4] = 0;
    await upload('capture-source.json', fixture('Captured source', w, h, raw, { mask, selection }));
    await change('zoom', 8); await click('cluster-capture'); await ready(); await change('cluster-name', 'Exact custom brush');
    const captured = await exportBrush();
    assert(captured.schema === 'poku-pixel-cluster-brush/v1' && captured.width === 3 && captured.height === 2
      && isDeepStrictEqual(captured.pixels, motif) && isDeepStrictEqual(captured.mask, [1, 1, 1, 1, 0, 0]) && isDeepStrictEqual(captured.anchor, [1, 0]),
    'Selection capture uses the true source row stride and preserves partial alpha, hidden RGB, selected transparent cells and excluded mask cells');
    assert((await exportProject()).layers.length === 0 && (await exportPNG()).rgba.equals(rgba(raw, mask)),
      'Capturing, naming and exporting a brush leaves the project pixels and layer history unchanged');
    await change('cluster-anchor-x', 0); await change('cluster-anchor-y', 0); const portable = await exportBrush();
    await upload('brush-roundtrip.json', portable, 'cluster-brush-file');
    assert(isDeepStrictEqual(await exportBrush(), portable), 'Brush file picker round trips preserve every native color, mask byte, name and local anchor');

    phase = 'exact native stamping, transformations and gesture history';
    const expected = Array(w * h).fill(background);
    await upload('stamp-target.json', fixture('Stamp target', w, h, expected));
    await change('paint-tool', 'cluster'); await checked('paint-in-selection', false); await checked('alpha-lock', false);
    await change('cluster-spacing', 4, 'input'); await change('cluster-rotation', 0); await checked('cluster-flip-x', false); await checked('cluster-flip-y', false);
    await gesture([[6, 6]]);
    expected[6 * w + 6] = motif[0]; expected[6 * w + 7] = motif[1]; expected[7 * w + 6] = motif[3];
    const firstStamp = await exportProject(), firstPNG = await exportPNG();
    assert(firstPNG.rgba.equals(rgba(expected)) && firstStamp.layers.length === 1 && firstStamp.layers[0].indices.length === 3,
      'A physical stamp replaces exact RGBA including alpha 1, while transparent and hidden donor cells leave the existing artwork untouched');
    assert(firstStamp.pixels.every(value => value === background), 'Cluster painting stores sparse replacements and preserves the imported source layer');
    await change('cluster-rotation', 90); await checked('cluster-flip-x', true); await gesture([[16, 8]]);
    expected[8 * w + 16] = motif[0]; expected[7 * w + 16] = motif[1]; expected[8 * w + 15] = motif[3];
    const transformed = await exportProject(), transformedPNG = await exportPNG();
    assert(transformedPNG.rgba.equals(rgba(expected)) && transformed.layers.length === 1 && transformed.layers[0].id === firstStamp.layers[0].id,
      'A non-square brush flip followed by a quarter turn moves cells and its anchor exactly, while reusing the active top paint layer');
    await undo(); assert((await exportPNG()).rgba.equals(firstPNG.rgba), 'Undo removes exactly one complete transformed stamping gesture');
    await redo(); assert((await exportPNG()).rgba.equals(transformedPNG.rgba), 'Redo restores the same transformed native pixels');
    await upload('stamped-roundtrip.json', transformed);
    assert((await exportPNG()).rgba.equals(transformedPNG.rgba) && isDeepStrictEqual((await exportProject()).layers, transformed.layers),
      'Saving and reopening cluster-painted projects preserves the exact image and editable sparse paint layer');

    phase = 'spacing phase, masks and alpha lock';
    const dotColor = color(245, 133, 61, 128), dot = { schema: 'poku-pixel-cluster-brush/v1', name: 'One authored cell', width: 1, height: 1, pixels: [dotColor], mask: [1], anchor: [0, 0] };
    await upload('dot-brush.json', dot, 'cluster-brush-file'); await change('cluster-rotation', 0); await checked('cluster-flip-x', false);
    await upload('spacing.json', fixture('Spacing phase', 32, 12)); await change('cluster-spacing', 5, 'input'); await gesture([[3, 4], [17, 4]]);
    const sparseSpacing = await exportPNG(), spacingExpected = Array(384).fill(0); for (const x of [3, 8, 13]) spacingExpected[4 * 32 + x] = dotColor;
    assert(sparseSpacing.rgba.equals(rgba(spacingExpected)), 'A 14-cell stroke places stamps at distances 0, 5 and 10 without adding an off-phase endpoint');
    await undo(); await gesture(Array.from({ length: 15 }, (_, i) => [3 + i, 4]));
    assert((await exportPNG()).rgba.equals(sparseSpacing.rgba), 'Dense and sparse physical pointer samples produce identical stamp spacing');
    await upload('diagonal-spacing.json', fixture('Continuous diagonal spacing', 12, 8)); await change('cluster-spacing', 2, 'input'); await gesture([[0, 0], [9, 3]]);
    const diagonal = await exportPNG(), diagonalExpected = Array(96).fill(0);
    for (const [x, y] of [[0, 0], [2, 1], [4, 1], [6, 2], [8, 3]]) diagonalExpected[y * 12 + x] = dotColor;
    assert(diagonal.rgba.equals(rgba(diagonalExpected)), 'Diagonal cluster spacing follows the actual continuous pointer path before converting stamp centers to native cells');
    await undo(); await gesture(Array.from({ length: 10 }, (_, i) => [i, i / 3]));
    assert((await exportPNG()).rgba.equals(diagonal.rgba), 'Intermediate fractional pointer positions do not turn a straight diagonal into a longer staircase or shift its stamp phase');
    const lockedPixels = Array.from({ length: 160 }, (_, i) => color(23, 61, 99, 31 + i % 100)), lockedMask = Array(160).fill(1), lockedSelection = Array(160).fill(0), protection = Array(160).fill(0);
    for (let x = 3; x <= 8; x++) lockedSelection[4 * 16 + x] = 1;
    lockedPixels[4 * 16 + 5] = color(32, 41, 57, 0); lockedMask[4 * 16 + 6] = 0; protection[4 * 16 + 4] = 1;
    await upload('locked-stamp.json', fixture('Selected and protected stamp', 16, 10, lockedPixels, { mask: lockedMask, selection: lockedSelection, protectedMask: protection }));
    await checked('paint-in-selection', true); await checked('alpha-lock', true); await change('cluster-spacing', 1, 'input'); await gesture([[2, 4], [10, 4]]);
    const lockExpected = lockedPixels.slice(); for (const x of [3, 7, 8]) lockExpected[4 * 16 + x] = ((dotColor & 0xffffff) | (lockedPixels[4 * 16 + x] & 0xff000000)) >>> 0;
    const locked = await exportProject();
    assert((await exportPNG()).rgba.equals(rgba(lockExpected, lockedMask)) && isDeepStrictEqual(locked.layers[0].indices, [67, 71, 72]),
      'Selection, protected detail and alpha lock constrain the destination, retaining its exact alpha and leaving hidden or empty cells untouched');

    phase = 'clone source selection, snapshot overlap and opacity';
    await checked('paint-in-selection', false); await checked('alpha-lock', false); await change('paint-tool', 'clone');
    await change('paint-size', 1); await change('paint-tip', 'square'); await change('paint-symmetry', 'none'); await checked('pixel-perfect', false);
    const sourceRow = Array.from({ length: 160 }, (_, i) => color(17 + i % 16 * 11, 31 + Math.floor(i / 16) * 13, 203 - i % 16 * 7));
    await upload('clone-overlap.json', fixture('Clone overlap snapshot', 16, 10, sourceRow));
    await checked('clone-aligned', true); await gesture([[2, 4]], { modifiers: 1 });
    assert((await exportProject()).layers.length === 0 && await evaluate("document.getElementById('clone-source-x').value==='2'&&document.getElementById('clone-source-y').value==='4'"),
      'Alt-click selects a clone donor cell without modifying any project pixels or layers');
    await gesture([[3, 4], [4, 4], [5, 4], [6, 4]]);
    const cloneExpected = sourceRow.slice(); for (let x = 3; x <= 6; x++) cloneExpected[4 * 16 + x] = sourceRow[4 * 16 + x - 1];
    assert((await exportPNG()).rgba.equals(rgba(cloneExpected)), 'An overlapping clone stroke reads the fixed pre-stroke donor and does not recursively smear newly written pixels');
    await gesture([[9, 4]]); cloneExpected[4 * 16 + 9] = sourceRow[4 * 16 + 8];
    assert((await exportPNG()).rgba.equals(rgba(cloneExpected)), 'Aligned clone gestures retain the same source-to-destination offset across separate strokes');
    await checked('clone-aligned', false); await gesture([[12, 4]]); cloneExpected[4 * 16 + 12] = sourceRow[4 * 16 + 2];
    assert((await exportPNG()).rgba.equals(rgba(cloneExpected)), 'Turning alignment off restarts each clone gesture at the explicitly chosen source cell');
    const beforePick = await exportProject(); await click('clone-pick'); await ready(); await gesture([[8, 3]]);
    assert(isDeepStrictEqual((await exportProject()).layers, beforePick.layers) && await evaluate("document.getElementById('clone-source-x').value==='8'&&document.getElementById('clone-source-y').value==='3'"),
      'The touch-accessible source-pick button chooses a new donor without painting');
    const translucent = fixture('Opacity clone proof', 16, 10, Array(160).fill(0), {
      activeLayerId: 'half-ink', layers: [{ kind: 'paint', id: 'half-ink', name: 'Half-opacity original ink', opacity: .5, indices: [4 * 16 + 2], pixels: [color(221, 74, 57)] }],
    });
    await upload('opacity-clone.json', translucent); await gesture([[2, 4]], { modifiers: 1 }); await gesture([[8, 4]]);
    const clonedOpacity = await exportProject(), opacityPNG = await exportPNG();
    assert(clonedOpacity.layers.length === 2 && clonedOpacity.layers[0].opacity === .5 && clonedOpacity.layers[1].id !== 'half-ink'
      && isDeepStrictEqual([...opacityPNG.rgba.subarray((4 * 16 + 8) * 4, (4 * 16 + 8) * 4 + 4)], [221, 74, 57, 128]),
    'Cloning the visible result of a half-opacity layer creates a new top layer and does not reduce the copied alpha a second time');
    const fullLayers = Array.from({ length: 32 }, (_, i) => ({ kind: 'paint', id: `full-${i}`, name: `Paint ${i}`, indices: [], pixels: [] }));
    await upload('full-brush-budget.json', fixture('Full layer stamp proof', 16, 10, Array(160).fill(0), { layers: fullLayers, activeLayerId: 'full-31' }));
    await change('paint-tool', 'cluster'); await gesture([[8, 4]]);
    assert((await exportProject()).layers.length === 32 && (await exportProject()).layers.at(-1).id === 'full-31',
      'A full 32-layer document can still stamp into its selected visible top paint layer');

    phase = 'physical editing across the repeated tile seam';
    await upload('seam-pencil.json', fixture('Unwrapped tile gesture', 16, 12)); await change('paint-tool', 'pencil'); await change('paint-color', '#ef704b', 'input');
    await change('paint-size', 1); await click('edit-tiles'); await ready(); await change('tile-zoom', 8);
    assert(await evaluate("document.getElementById('paint-wrap').checked&&document.getElementById('tile-preview').checked&&document.getElementById('tile-canvas').dataset.editable==='true'"),
      'The tile-edit action exposes an interactive repeated canvas and enables supported wrapped painting');
    await gesture([[14, 5], [18, 5]], { surface: 'tile-canvas' });
    const seamExpected = Array(192).fill(0); for (const x of [14, 15, 0, 1, 2]) seamExpected[5 * 16 + x] = color(239, 112, 75);
    const seamPNG = await exportPNG();
    assert(seamPNG.rgba.equals(rgba(seamExpected)), 'A physical gesture crossing from x=14 to x=18 in the 3×3 canvas paints both edges and leaves the middle untouched');
    await undo(); assert((await exportProject()).layers.length === 0, 'One wrapped tile gesture remains one undo step'); await redo();
    await change('paint-tool', 'rectangle');
    assert(await evaluate("document.getElementById('paint-wrap').disabled&&document.getElementById('paint-wrap-note').textContent.includes('지원하지')&&document.getElementById('tile-canvas').dataset.editable==='false'"),
      'Rectangle editing explicitly disables unsupported wrap and marks the repeated surface as read-only');
    await change('paint-tool', 'ellipse'); assert(await evaluate("document.getElementById('paint-wrap').disabled"), 'Ellipse editing also explicitly disables unsupported wrap');

    const tileColors = Array.from({ length: 192 }, (_, i) => color(19 + i % 16 * 12, 47 + Math.floor(i / 16) * 9, 213 - i % 16 * 8, 73 + i % 9 * 17));
    await upload('seam-clone.json', fixture('Wrapped clone source', 16, 12, tileColors)); await change('paint-tool', 'clone'); await checked('paint-wrap', true);
    await gesture([[16, 5]], { surface: 'tile-canvas', modifiers: 1 }); await gesture([[14, 5], [18, 5]], { surface: 'tile-canvas' });
    const tileCloneExpected = tileColors.slice(); for (let i = 0; i < 5; i++) tileCloneExpected[5 * 16 + (14 + i) % 16] = tileColors[5 * 16 + i];
    assert((await exportPNG()).rgba.equals(rgba(tileCloneExpected)),
      'Wrapped clone picking and painting use the same donor for repeated copies and fold donor coordinates only after the continuous stroke');
    await upload('seam-cluster.json', fixture('Wrapped multi-color cluster', 16, 12, Array(192).fill(background))); await upload('seam-brush.json', portable, 'cluster-brush-file');
    await change('cluster-rotation', 0); await checked('cluster-flip-x', false); await checked('cluster-flip-y', false); await change('cluster-spacing', 4, 'input');
    await gesture([[15, 11]], { surface: 'tile-canvas' });
    const tileStampExpected = Array(192).fill(background); tileStampExpected[11 * 16 + 15] = motif[0]; tileStampExpected[11 * 16] = motif[1]; tileStampExpected[15] = motif[3];
    assert((await exportPNG()).rgba.equals(rgba(tileStampExpected)), 'An authored multicolor cluster wraps its complete footprint across both tile axes with exact partial alpha');
    await change('paint-tool', 'eraser'); await gesture([[15, 11], [15, 13]], { surface: 'tile-canvas' });
    for (const index of [11 * 16 + 15, 15, 16 + 15]) tileStampExpected[index] = 0;
    assert((await exportPNG()).rgba.equals(rgba(tileStampExpected)), 'The same repeated canvas supports wrapped erasure without damaging neighboring copied cells');

    phase = 'canceling and saving active gestures, then independent cels';
    await upload('cancel-stamp.json', fixture('Canceled brush gesture', 24, 20)); await change('paint-tool', 'cluster'); await checked('paint-wrap', false);
    const pendingPoint = await gesture([[7, 7], [11, 7]], { release: false });
    await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
    await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 }); await release(pendingPoint); await ready();
    assert((await exportProject()).layers.length === 0 && !(await exportPNG()).rgba.some(Boolean), 'Escape cancels a physical in-progress cluster gesture without leaving a preview or sparse paint override');
    const savingPoint = await gesture([[7, 7]], { release: false }); const savedPending = await exportProject(); await release(savingPoint); await ready();
    assert(savedPending.layers.length === 1 && savedPending.layers[0].indices.length === 3, 'Saving during an active gesture first commits exactly the visible cluster stroke');
    const celOne = await exportPNG(); await click('duplicate-frame'); await ready("document.querySelectorAll('#frame-list button').length===2"); await gesture([[16, 10]]);
    const animation = await exportProject();
    assert(animation.schema === 'poku-pixel-art/v3' && animation.frames[0].document.layers[0].indices.length === 3 && animation.frames[1].document.layers[0].indices.length === 6,
      'Duplicated animation cels keep their own independent cluster-painted sparse layers');
    await evaluate("document.querySelectorAll('#frame-list button')[0].click()"); await ready();
    assert((await exportPNG()).rgba.equals(celOne.rgba), 'Returning to the original cel restores its exact pre-duplication PNG');

    phase = 'responsive controls and captured evidence';
    await click('craft-study-folds'); await ready(); await change('paint-tool', 'cluster'); await change('cluster-brush', 1);
    await evaluate("document.getElementById('cluster-panel').open=true;document.getElementById('clone-panel').open=true");
    if (process.env.PIXEL_ART_BRUSHES_SCREENSHOT_PATH) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1600, deviceScaleFactor: 1, mobile: false });
      await evaluate('scrollTo(0,0)'); await painted();
      await mkdir(dirname(process.env.PIXEL_ART_BRUSHES_SCREENSHOT_PATH), { recursive: true });
      const screenshot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(process.env.PIXEL_ART_BRUSHES_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: true }); await ready();
    const mobile = await evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      panels: [...document.querySelectorAll('.brush-workbench,.brush-workbench .craft-panel,.recovery-panel')].map(p => ({ width: p.getBoundingClientRect().width, right: p.getBoundingClientRect().right })) }));
    assert(mobile.document <= mobile.viewport + 1 && mobile.panels.every(p => p.width > 0 && p.right <= mobile.viewport + 1),
      'Expanded cluster, clone and recovery controls fit a 390px viewport while large repeated canvases scroll inside their own panel');
    assert(!(await evaluate('window.__pokuUnhandled')).length && !browser.exceptions.length,
      'Brush capture, clone gestures, tile editing, canceled previews, file exports and cel switches produce no uncaught browser exceptions');
    return { status: 'passed', checks, mobile, cluster: { width: portable.width, height: portable.height, alpha: portable.pixels.map(c => c >>> 24), exactRGBA_SHA256: digest(transformedPNG.rgba) },
      tile: { width: 16, height: 12, unwrappedGesture: [[14, 5], [18, 5]], rgbaSHA256: digest(seamPNG.rgba) },
      scope: 'Actual bundled UI, physical CDP pointer input on native and repeated canvases, file pickers and independent exact-RGBA expectations. No artistic-quality score or physical-GPU performance claim.' };
  });
} catch (error) { report = { status: error instanceof BrowserUnavailable ? 'unavailable' : 'failed', phase, reason: String(error), checks }; }
finally { await rm(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify(report, null, 2));
if (process.env.PIXEL_ART_BRUSHES_REPORT_PATH) {
  await mkdir(dirname(process.env.PIXEL_ART_BRUSHES_REPORT_PATH), { recursive: true });
  await writeFile(process.env.PIXEL_ART_BRUSHES_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
}
if (report.status === 'failed' || process.env.PIXEL_ART_BRUSHES_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
