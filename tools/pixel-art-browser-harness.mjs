import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';

const checks = [];
const assert = (condition, description) => { if (!condition) throw new Error(description); checks.push(description); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rgb = rgba => {
  const colors = new Set();
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) colors.add(rgba[i] | rgba[i + 1] << 8 | rgba[i + 2] << 16);
  return colors;
};
const alpha = rgba => Buffer.from(Array.from({ length: rgba.length / 4 }, (_, i) => rgba[i * 4 + 3]));
const rgbaFromPacked = pixels => {
  const rgba = Buffer.alloc(pixels.length * 4);
  for (let i = 0; i < pixels.length; i++) {
    const c = pixels[i]; rgba.set([c & 255, c >>> 8 & 255, c >>> 16 & 255, c >>> 24], i * 4);
  }
  return rgba;
};
const temporary = await mkdtemp(join(tmpdir(), 'poku-pixel-art-qa-'));
let report;
try {
  report = await withHarnessBrowser(async browser => {
    const { evaluate, waitFor, send } = browser;
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const painted = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    const ready = async (predicate = 'true') => {
      // Navigation may still be replacing about:blank; the shared waiter retries destroyed contexts.
      await waitFor("document.getElementById('result')?.dataset.ready==='true'");
      await painted();
      await waitFor(`(()=>{const c=document.getElementById('result'),s=document.getElementById('status');if(s?.classList.contains('error'))throw new Error(s.textContent);return c?.dataset.ready==='true'&&(${predicate});})()`);
    };
    const change = async (id, value, event = 'change') => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
      await ready();
    };
    const readCanvas = async (id = 'result') => {
      const raw = await evaluate(`(()=>{const c=document.getElementById(${JSON.stringify(id)}),rgba=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let text='';for(let i=0;i<rgba.length;i+=16384)text+=String.fromCharCode(...rgba.subarray(i,i+16384));return{width:c.width,height:c.height,base64:btoa(text)};})()`);
      return { width: raw.width, height: raw.height, rgba: Buffer.from(raw.base64, 'base64') };
    };
    const palette = () => evaluate(() => [...document.querySelectorAll('#palette input')].map(input => {
      const hex = input.value.slice(1); return parseInt(hex.slice(0, 2), 16) | parseInt(hex.slice(2, 4), 16) << 8 | parseInt(hex.slice(4, 6), 16) << 16;
    }));
    const exportFile = async (control, suffix) => {
      const selector = `#downloads a[download$="${suffix}"]`;
      const old = await evaluate(`document.querySelector(${JSON.stringify(selector)})?.href??''`);
      await click(control);
      await waitFor(`(()=>{const a=document.querySelector(${JSON.stringify(selector)});return !!a&&a.href!==${JSON.stringify(old)};})()`);
      const file = await evaluate(`(async()=>{const a=document.querySelector(${JSON.stringify(selector)}),bytes=new Uint8Array(await(await fetch(a.href)).arrayBuffer());let text='';for(let i=0;i<bytes.length;i+=16384)text+=String.fromCharCode(...bytes.subarray(i,i+16384));return{name:a.download,base64:btoa(text)};})()`);
      return { name: file.name, bytes: Buffer.from(file.base64, 'base64') };
    };
    const exportProject = async () => JSON.parse((await exportFile('save-project', '.poku-pixel-art.json')).bytes.toString('utf8'));
    const upload = async (id, file) => {
      const dom = await send('DOM.getDocument');
      const node = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: `#${id}` });
      if (!node.nodeId) throw new Error(`Missing file input ${id}`);
      await send('DOM.setFileInputFiles', { nodeId: node.nodeId, files: [file] });
      await waitFor(`document.getElementById(${JSON.stringify(id)}).value===''`);
      await painted();
    };
    const mouseCell = async (x, y) => {
      await evaluate("document.getElementById('source').scrollIntoView({block:'center',inline:'center'})");
      const point = await evaluate(`(()=>{const c=document.getElementById('source'),r=c.getBoundingClientRect();return{x:r.left+(${x}+.5)*r.width/c.width,y:r.top+(${y}+.5)*r.height/c.height};})()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
      await ready();
    };

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1.5, mobile: false });
    await browser.navigate('/gallery/pixel-art-lab.html');
    await ready("Number(document.getElementById('metric-colors').textContent)>1");
    await evaluate(() => document.fonts.ready.then(() => true));
    const initial = await readCanvas(), initialSource = await readCanvas('source');
    assert(initial.width === 192 && initial.height === 112 && rgb(initial.rgba).size > 3
      && alpha(initial.rgba).some(a => a === 0) && alpha(initial.rgba).some(a => a === 255),
    'Pixel Art Lab loads the bundled native study with actual opaque material colors and transparent exterior');
    assert(Number(await evaluate("document.getElementById('metric-colors').textContent")) === rgb(initial.rgba).size,
      'Displayed color analysis describes the actual native raster');
    const sizing = await evaluate(() => ['source', 'result'].map(id => {
      const c = document.getElementById(id), rect = c.getBoundingClientRect();
      return { id, scaleX: rect.width * devicePixelRatio / c.width, scaleY: rect.height * devicePixelRatio / c.height,
        dpr: devicePixelRatio, rendering: getComputedStyle(c).imageRendering };
    }));
    assert(sizing.every(s => s.dpr === 1.5 && s.rendering === 'pixelated'
      && Math.abs(s.scaleX - Math.round(s.scaleX)) < .01 && Math.abs(s.scaleY - Math.round(s.scaleY)) < .01),
    'Both native canvases occupy integer device-pixel scales at fractional 1.5 DPR');
    const koreanFont = await evaluate(() => [...document.fonts].some(font => font.family.includes('Poku Studio UI') && font.status === 'loaded')
      && getComputedStyle(document.body).fontFamily.includes('Poku Studio UI'));
    assert(koreanFont, 'The local Korean font loads and is used without an operating-system CJK font requirement');

    await change('material', 'metal');
    const metal = await readCanvas();
    assert(!metal.rgba.equals(initial.rgba) && (await readCanvas('source')).rgba.equals(initialSource.rgba),
      'Changing material changes the preview while leaving the committed source unchanged');
    await change('light-angle', '-55', 'input');
    const lit = await readCanvas(), allowed = new Set(await palette());
    assert(!lit.rgba.equals(metal.rgba) && alpha(lit.rgba).equals(alpha(initial.rgba)),
      'The light control changes native shading without changing silhouette coverage');
    assert([...rgb(lit.rgba)].every(c => allowed.has(c)), 'Material preview remains within the selected authored palette');
    const fullPNG = decodePNG((await exportFile('save-png', '.png')).bytes);
    assert(fullPNG.width === 192 && fullPNG.height === 112 && Buffer.from(fullPNG.rgba).equals(lit.rgba)
      && [...rgb(fullPNG.rgba)].every(c => allowed.has(c)),
    'Native PNG export decodes to the exact visible palette, alpha and source dimensions, independent of zoom');

    await click('apply-material'); await ready("document.getElementById('layer-count').textContent==='1'&&document.getElementById('render-state').textContent==='APPLIED'");
    assert((await readCanvas()).rgba.equals(lit.rgba), 'Applying a preview creates one layer without changing its native pixels');
    const saved = await exportProject(), savedPath = join(temporary, 'reopen-study.poku-pixel-art.json');
    await writeFile(savedPath, JSON.stringify(saved));
    await click('undo'); await ready("document.getElementById('layer-count').textContent==='0'");
    assert((await readCanvas()).rgba.equals(rgbaFromPacked(saved.pixels)), 'Layer undo restores the original native source');
    await click('redo'); await ready("document.getElementById('layer-count').textContent==='1'");
    assert((await readCanvas()).rgba.equals(lit.rgba), 'Layer redo reproduces the exact applied material');
    await change('shape', 'boulder');
    await upload('project-file', savedPath); await ready("document.getElementById('shape').value==='imported'&&document.getElementById('layer-count').textContent==='1'");
    assert((await readCanvas()).rgba.equals(lit.rgba) && isDeepStrictEqual(await exportProject(), saved),
      'A project opened through the actual file input preserves original pixels, authored settings and applied output exactly');

    // An independent encoded fixture exercises selections and alpha, without relying on generated art.
    const fw = 24, fh = 16, fixture = Buffer.alloc(fw * fh * 4);
    for (let y = 2; y < 14; y++) for (let x = 2; x < 22; x++) {
      if (x > 10 && x < 13) continue;
      fixture.set(x < 11 ? [64, 96, 128, 255] : [128, 80, 32, 255], (y * fw + x) * 4);
    }
    fixture.set([255, 255, 255, 255], (7 * fw + 6) * 4);
    // End-point RGB channels survive browser premultiplication exactly at this coverage.
    fixture.set([255, 0, 255, 128], (12 * fw + 18) * 4);
    const fixturePath = join(temporary, 'selected-pixels.png');
    await writeFile(fixturePath, encodePNG(fw, fh, fixture));
    await upload('png-file', fixturePath);
    await ready("document.getElementById('source-size').textContent==='24 × 16'&&document.getElementById('layer-count').textContent==='0'");
    assert((await readCanvas()).rgba.equals(fixture)
      && await evaluate("document.getElementById('render-state').textContent==='APPLIED'&&document.getElementById('apply-material').disabled"),
    'Importing a PNG preserves it unchanged until an explicit material or selection edit');
    const imported = await exportProject();
    assert(rgbaFromPacked(imported.pixels).equals(fixture) && imported.layers.length === 0,
      'The imported project retains the original native RGBA source without a hidden material layer');

    await change('material', 'wood');
    await click('clear-selection'); await ready();
    assert((await readCanvas()).rgba.equals(fixture) && await evaluate("document.getElementById('apply-material').disabled"),
      'An empty selection leaves every source cell unchanged and disables material application');
    await change('selection-tool', 'connected'); await change('tolerance', '0', 'input');
    await mouseCell(4, 6);
    await change('selection-tool', 'protect'); await change('brush-size', '1', 'input');
    await mouseCell(6, 6);
    const selected = await readCanvas();
    await click('apply-material'); await ready("document.getElementById('layer-count').textContent==='1'&&document.getElementById('render-state').textContent==='APPLIED'");
    const selectionProject = await exportProject(), layer = selectionProject.layers[0];
    let changedCells = 0, untouchedPreserved = true, selectedPalette = true;
    const woodPalette = new Set(layer.material.palette.map(c => c & 0xffffff));
    for (let i = 0; i < fw * fh; i++) {
      const before = fixture.subarray(i * 4, i * 4 + 4), after = selected.rgba.subarray(i * 4, i * 4 + 4);
      if (!layer.selection[i] || layer.protectedMask[i]) untouchedPreserved &&= before.equals(after);
      else {
        if (!before.equals(after)) changedCells++;
        selectedPalette &&= woodPalette.has(after[0] | after[1] << 8 | after[2] << 16);
      }
    }
    assert(layer.selection.reduce((a, b) => a + b, 0) === 107
      && layer.protectedMask.reduce((a, b) => a + b, 0) === 1 && layer.protectedMask[6 * fw + 6] === 1,
    'Connected color selection and an actual pointer protection brush record the intended native cells at 1.5 DPR');
    assert(changedCells > 0 && untouchedPreserved && selectedPalette && alpha(selected.rgba).equals(alpha(fixture)),
      'Selected cells receive the material while unselected colors, protected details, transparency and partial alpha remain intact');
    assert(rgbaFromPacked(selectionProject.pixels).equals(fixture) && (await readCanvas()).rgba.equals(selected.rgba),
      'Applying a selected material keeps original source pixels and reproduces its preview exactly');

    await change('view', 'normal');
    const selectedPNG = decodePNG((await exportFile('save-png', '.png')).bytes);
    assert(selectedPNG.width === fw && selectedPNG.height === fh && Buffer.from(selectedPNG.rgba).equals(selected.rgba),
      'PNG export contains color pixels and exact coverage even while the diagnostic normal view is displayed');
    await change('view', 'color');
    const selectionPath = join(temporary, 'selected-pixels.poku-pixel-art.json');
    await writeFile(selectionPath, JSON.stringify(selectionProject));
    await change('shape', 'cloth'); await upload('project-file', selectionPath); await ready();
    assert((await readCanvas()).rgba.equals(selected.rgba) && isDeepStrictEqual(await exportProject(), selectionProject),
      'Selected/protected masks and the native source survive a project save/reopen round trip');

    const malformed = structuredClone(selectionProject); malformed.pixels.pop();
    const malformedPath = join(temporary, 'invalid-pixel-art.json'); await writeFile(malformedPath, JSON.stringify(malformed));
    await upload('project-file', malformedPath);
    await waitFor("document.getElementById('status').classList.contains('error')");
    assert((await readCanvas()).rgba.equals(selected.rgba) && isDeepStrictEqual(await exportProject(), selectionProject),
      'Malformed project input reports an error without replacing the last valid source, layers or visible output');

    // Valid API values outside the initial slider ranges must not be rewritten by an unrelated UI edit.
    const stress = structuredClone(selectionProject), stressLayer = stress.layers[0];
    stress.name = 'Imported precise material settings';
    Object.assign(stressLayer.material, { scale: 127, relief: 12.375, bevel: 20, ambient: .8,
      light: [0, 0, -2], grainAngle: 9, materialId: 37,
      thresholds: Array.from({ length: stressLayer.material.palette.length - 1 }, (_, i) => ((i + 1) / stressLayer.material.palette.length) ** 1.3) });
    stressLayer.origin = [13.25, -7.5];
    const hiddenCell = 6 * fw + 4;
    stress.mask ??= stress.pixels.map(c => c >>> 24 ? 1 : 0);
    stress.mask[hiddenCell] = 0;
    const stressPath = join(temporary, 'precise-settings.poku-pixel-art.json'); await writeFile(stressPath, JSON.stringify(stress));
    await upload('project-file', stressPath); await ready();
    const maskedSave = await exportProject(), maskedPNG = decodePNG((await exportFile('save-png', '.png')).bytes);
    assert((await readCanvas()).rgba[hiddenCell * 4 + 3] === 0
      && (await readCanvas('source')).rgba[hiddenCell * 4 + 3] === 0 && maskedPNG.rgba[hiddenCell * 4 + 3] === 0
      && maskedSave.pixels[hiddenCell] === stress.pixels[hiddenCell] && maskedSave.pixels[hiddenCell] >>> 24 === 255
      && maskedSave.mask[hiddenCell] === 0,
    'Independent source masks hide stored opaque pixels in both canvases and PNG while project JSON retains the original raw pixel');
    await change('seed', '7', 'input');
    const changed = await exportProject(), pending = changed.layers.at(-1);
    const expectedSettings = { ...stressLayer.material, seed: 7 };
    assert(isDeepStrictEqual(pending.material, expectedSettings) && isDeepStrictEqual(pending.origin, stressLayer.origin),
      'Changing only seed preserves imported precise ranges, vertical negative light, grain angle, ramp thresholds, material ID and object origin');

    // Restore a useful authoring view for the optional screenshot and viewport checks.
    await change('shape', 'stone-path'); await change('zoom', '2');
    const zoom = await evaluate(() => {
      const c = document.getElementById('result'), r = c.getBoundingClientRect();
      return { x: r.width * devicePixelRatio / c.width, y: r.height * devicePixelRatio / c.height };
    });
    assert(Math.abs(zoom.x - 3) < .01 && Math.abs(zoom.y - 3) < .01,
      'Explicit 2× display zoom also maps to integer native-cell device pixels at 1.5 DPR');
    await change('zoom', 'auto');
    await evaluate('scrollTo(0,0)');
    if (process.env.PIXEL_ART_SCREENSHOT_PATH) {
      const screenshot = await send('Page.captureScreenshot', { format: 'png' });
      await writeFile(process.env.PIXEL_ART_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64'));
    }
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1.5, mobile: true });
    await ready();
    const mobile = await evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth, panels: [...document.querySelectorAll('.art-panel,.inspector')].map(e => ({ width: e.getBoundingClientRect().width, right: e.getBoundingClientRect().right })) }));
    assert(mobile.document <= mobile.viewport + 1 && mobile.body <= mobile.viewport + 1
      && mobile.panels.every(panel => panel.right <= mobile.viewport + 1 && panel.width > 0),
    'The mobile authoring layout has no horizontal page overflow and keeps its panels in the viewport');
    const errors = await evaluate('window.__pokuUnhandled');
    assert(!errors.length && !browser.exceptions.length, 'Material editing, import/export and responsive presentation have no uncaught browser errors');
    return { status: 'passed', checks, sizing, mobile,
      nativePNG: { width: fullPNG.width, height: fullPNG.height, paletteColors: rgb(fullPNG.rgba).size, rgbaSHA256: digest(fullPNG.rgba) },
      selectedPNG: { width: selectedPNG.width, height: selectedPNG.height, changedCells, protectedCells: 1, rgbaSHA256: digest(selectedPNG.rgba) },
      scope: 'Actual native Canvas UI, material/light controls, layer history, pointer selections/protection, PNG and project file round trips, fractional DPR and mobile layout. These checks do not certify artistic quality.' };
  });
} catch (error) {
  report = { status: error instanceof BrowserUnavailable ? 'unavailable' : 'failed', reason: String(error), checks };
} finally {
  await rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify(report, null, 2));
if (process.env.PIXEL_ART_REPORT_PATH) await writeFile(process.env.PIXEL_ART_REPORT_PATH, JSON.stringify(report, null, 2) + '\n');
if (report.status === 'failed' || process.env.PIXEL_ART_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
