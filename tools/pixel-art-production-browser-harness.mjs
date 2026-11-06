import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual as equal } from 'node:util';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';
import { decodePNG } from '../build-tools/tools/lib/png-read.mjs';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';

const checks = [], assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const color = (r, g, b, a = 255) => (r | g << 8 | b << 16 | a << 24) >>> 0;
const rgba = (pixels, mask) => Buffer.from(pixels.flatMap((c, i) => [c & 255, c >>> 8 & 255, c >>> 16 & 255, mask && !mask[i] ? 0 : c >>> 24]));
const fixture = (name, width, height, pixels, extra = {}) => ({ schema: 'poku-pixel-art/v2', name, width, height, pixels, layers: [], ...extra });
const temporary = await mkdtemp(join(tmpdir(), 'poku-pixel-production-'));
let report, phase = 'initialization';
try {
  report = await withHarnessBrowser(async browser => {
    const { evaluate, send, waitFor } = browser;
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const ready = async (allowError = false) => {
      await waitFor("document.getElementById('result')?.dataset.ready==='true'");
      await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
      if (!allowError) await evaluate(() => { const s = document.getElementById('status'); if (s.classList.contains('error')) throw new Error(s.textContent); });
    };
    const change = async (id, value, event = 'change') => {
      await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(String(value))};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`); await ready();
    };
    const check = async (id, value) => { await evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});if(e.checked!==${value})e.click();})()`); await ready(); };
    const uploadFile = async (id, path) => {
      const dom = await send('DOM.getDocument'), input = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#' + id });
      await send('DOM.setFileInputFiles', { nodeId: input.nodeId, files: [path] });
    };
    const upload = async document => {
      const path = join(temporary, 'project.json'); await writeFile(path, JSON.stringify(document)); await uploadFile('project-file', path);
      await waitFor("document.getElementById('project-file').value===''"); await ready();
    };
    const download = async (control, suffix) => {
      const selector = JSON.stringify(`#downloads a[download$="${suffix}"]`), before = await evaluate(`document.querySelector(${selector})?.href??''`);
      await click(control);
      await waitFor(`(()=>{const a=document.querySelector(${selector});return a&&a.href!==${JSON.stringify(before)};})()`);
      const raw = await evaluate(`(async()=>{const a=document.querySelector(${selector}),b=new Uint8Array(await(await fetch(a.href)).arrayBuffer());let s='';for(let i=0;i<b.length;i+=16384)s+=String.fromCharCode(...b.subarray(i,i+16384));return btoa(s);})()`);
      await ready(); return Buffer.from(raw, 'base64');
    };
    const project = async () => JSON.parse(await download('save-project', '.poku-pixel-art.json'));
    const png = async () => Buffer.from(decodePNG(await download('save-png', '.png')).rgba);
    const chooseFrame = async index => { await evaluate(`document.querySelectorAll('#frame-list button')[${index}].click()`); await ready(); };
    const importSheet = async () => {
      await click('import-animation-sheet');
      await waitFor("!document.getElementById('import-animation-sheet').disabled"); await ready();
    };

    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1100, deviceScaleFactor: 1, mobile: false });
    await browser.navigate('/gallery/pixel-art-lab.html'); await ready();
    phase = 'exact color editing and saved swatches';
    const red = color(224, 0, 0), blue = color(0, 16, 223), source = [red, blue, color(224, 0, 0, 1), color(224, 0, 0, 128), color(224, 0, 0, 0), red, color(44, 55, 66), red];
    const mask = [1, 1, 1, 1, 0, 1, 1, 0], protection = [0, 0, 0, 1, 0, 0, 0, 0];
    const channels = { material: Array(8).fill(3), height: [0, 1, 2, 3, 4, 5, 6, 7], normal: Array.from({ length: 24 }, (_, i) => i % 3 === 2 ? 1 : 0) };
    const doc = fixture('Exact color proof', 4, 2, source, { mask, protectedMask: protection, channels, workingPalette: [red, blue] });
    await upload(doc);
    assert(await evaluate("document.querySelectorAll('#workbench-palette input').length===2"), 'Opening a document restores its authoring swatches');
    await change('color-from', '#e00000'); await change('color-to', '#0010df'); await check('color-swap', true);
    await click('replace-exact-color'); await ready();
    const expected = [blue, red, color(0, 16, 223, 1), source[3], source[4], blue, source[6], source[7]];
    assert((await png()).equals(rgba(expected, mask)), 'Simultaneous two-color swap preserves alpha 1/128, hidden RGB, masked cells and protected detail');
    const swapped = await project();
    assert(equal(swapped.pixels, source) && swapped.layers.length === 1 && swapped.layers[0].kind === 'paint' && equal(swapped.channels, channels), 'Color replacement adds one sparse layer while retaining source pixels and surface channels');
    await click('undo'); await ready(); assert((await png()).equals(rgba(source, mask)), 'Undo restores exact color bytes');
    await click('redo'); await ready(); assert((await png()).equals(rgba(expected, mask)), 'Redo restores the complete color operation');
    await upload(swapped); assert((await png()).equals(rgba(expected, mask)), 'Saved color layers reopen with identical exported bytes');
    await evaluate("(()=>{const s=document.querySelector('#workbench-palette input');s.value='#123456';s.dispatchEvent(new Event('input',{bubbles:true}));})()"); await ready();
    const paletteEdited = await project();
    assert(paletteEdited.workingPalette[0] === color(18, 52, 86) && (await png()).equals(rgba(expected, mask)), 'Editing a saved swatch changes authoring metadata without recoloring the artwork');
    await upload(paletteEdited);
    assert(await evaluate("document.querySelector('#workbench-palette input').value==='#123456'"), 'Saving and reopening retains exact edited swatches and their order');
    await upload({ ...doc, selection: [1, 0, 0, 1, 0, 0, 0, 0] }); await check('color-selection-only', true);
    await click('replace-exact-color'); await ready();
    assert((await png()).equals(rgba([blue, ...source.slice(1)], mask)), 'Selection restriction and detail protection intersect for exact recoloring');
    await check('color-selection-only', false);

    phase = 'native ramp mapping';
    const ramp = [color(8, 12, 24), color(83, 115, 143), color(225, 242, 220)];
    await upload(fixture('Linear ramp', 9, 1, Array(9).fill(color(80, 80, 80)), { workingPalette: ramp }));
    await check('color-selection-only',true);
    await change('gradient-mode', 'linear'); await click('gradient-fit-horizontal'); await change('gradient-dither', 'none');
    await click('apply-ramp-map'); await ready();
    const linear = [ramp[0], ramp[0], ramp[1], ramp[1], ramp[1], ramp[1], ramp[2], ramp[2], ramp[2]];
    assert((await png()).equals(rgba(linear)), 'A native 9-cell linear ramp uses exact authored palette entries with correct endpoints and boundaries');
    assert((await project()).pixels.every(c => c === color(80, 80, 80)), 'Ramp mapping retains original source colors for editing');
    await click('undo'); await ready(); await change('gradient-mode', 'radial');
    await change('gradient-start-x', 4); await change('gradient-end-x', 8); await click('apply-ramp-map'); await ready();
    assert((await png()).equals(rgba([ramp[2], ramp[2], ramp[1], ramp[1], ramp[0], ramp[1], ramp[1], ramp[2], ramp[2]])), 'Radial mapping is symmetric around the authored native center');
    await change('gradient-end-x', 4); const beforeInvalidRamp = await project(); await click('apply-ramp-map'); await ready(true);
    assert(await evaluate("document.getElementById('status').classList.contains('error')"), 'A zero-radius ramp reports a recoverable error');
    assert(equal(await project(), beforeInvalidRamp), 'A rejected ramp does not alter project data');
    await check('color-selection-only',false);

    phase = 'extracted palette order';
    await upload(fixture('Locked white palette', 3, 1, [color(255, 255, 255), color(0, 0, 0), color(128, 128, 128)]));
    assert(await evaluate("document.querySelectorAll('#workbench-palette input').length===0"), 'Opening a project with no working palette clears swatches from the previous project');
    await change('paint-color', '#ffffff'); await check('lock-paint-color', true); await change('palette-count', 3);
    await click('extract-palette'); await ready();
    assert(equal((await project()).workingPalette, [color(0, 0, 0), color(128, 128, 128), color(255, 255, 255)]), 'A locked highlight stays exact but no longer appears before black in an extracted shade ramp');

    phase = 'batch color edits and frame metadata';
    const frames = [40, 100, 160].map((durationMs, i) => ({ id: `cel-${i}`, name: `Cel ${i}`, durationMs,
      document: fixture(`Cel ${i}`, 2, 1, [red, color(0, 16, 223, i === 0 ? 1 : 255)], { workingPalette: [red, blue] }) }));
    const animation = { schema: 'poku-pixel-art/v3', name: 'Timed proof', width: 2, height: 1, frames, activeFrameId: 'cel-0', loop: false, direction: 'pingpong' };
    await upload(animation); const beforeBatch=await project(); await check('color-all-frames', true); await click('replace-exact-color'); await ready();
    const batch = await project();
    assert(batch.frames.every(frame => frame.document.layers.length === 1) && batch.frames.map(frame => frame.durationMs).join() === '40,100,160', 'Batch recoloring updates every independent cel without changing timing');
    await click('undo'); await ready(); assert(equal((await project()).frames, beforeBatch.frames), 'One undo restores the whole animation before the batch operation');
    await click('redo'); await ready(); assert(equal((await project()).frames, batch.frames), 'One redo restores all frame color layers');
    await check('color-all-frames', false); await upload(animation);

    phase = 'sheet export and exact manifest import';
    await change('sheet-columns', 2); await change('sheet-padding', 1);
    const sheetBytes = await download('save-animation-sheet', '-sheet.png');
    const manifest = await evaluate("(async()=>{const a=document.querySelector('#downloads a[download$=\"-sheet.json\"]');return await(await fetch(a.href)).json();})()");
    const sheetPath = join(temporary, 'sheet.png'), manifestPath = join(temporary, 'sheet.json');
    await writeFile(sheetPath, sheetBytes); await writeFile(manifestPath, JSON.stringify(manifest));
    await uploadFile('animation-sheet-file', sheetPath); await uploadFile('animation-sheet-manifest', manifestPath);
    await change('sheet-import-mode', 'manifest'); await importSheet();
    const reopened = await project();
    assert(reopened.direction === 'pingpong' && !reopened.loop && reopened.frames.map(f => f.durationMs).join() === '40,100,160', 'Sheet manifest restores unequal timing, ping-pong direction and non-looping playback');
    assert(equal(reopened.frames.map(f => [f.id, f.name, f.document.pixels]), frames.map(f => [f.id, f.name, f.document.pixels])), 'Manifest import restores original IDs, names and exact partial-alpha RGB in independent cels');
    await chooseFrame(2); await click('undo'); await ready();
    assert((await project()).frames.every(frame => frame.document.workingPalette?.length === 2), 'Sheet import is undoable and restores the preceding editable animation');

    phase = 'large grid slicing and atomic failures';
    const sheetW = 520, sheetH = 6, sheetPixels = Array(sheetW * sheetH).fill(0);
    const gridFrames = [];
    for (let frame = 0; frame < 3; frame++) {
      const pixels = Array.from({ length: 172 * 4 }, (_, i) => color(31 + frame * 80, 63 + i % 70, 97, i % 5 === 0 ? 1 : i % 5 === 1 ? 0 : 255));
      gridFrames.push(pixels);
      for (let y = 0; y < 4; y++) for (let x = 0; x < 172; x++) sheetPixels[(y + 1) * sheetW + 1 + frame * 173 + x] = pixels[y * 172 + x];
    }
    const gridPath = join(temporary, 'large-grid.png'); await writeFile(gridPath, encodePNG(sheetW, sheetH, rgba(sheetPixels)));
    await uploadFile('animation-sheet-file', gridPath); await change('sheet-import-mode', 'grid');
    for (const [id, value] of [['slice-width', 172], ['slice-height', 4], ['slice-margin-x', 1], ['slice-margin-y', 1], ['slice-gap-x', 1], ['slice-gap-y', 0]]) await change(id, value);
    await importSheet(); const sliced = await project();
    assert(sliced.frames.length === 3 && sliced.width === 172 && sliced.height === 4, 'Explicit sheet limits import a PNG wider than the ordinary still-image limit');
    assert(equal(sliced.frames.map(frame => frame.document.pixels), gridFrames), 'Grid margin/gap slicing preserves hidden RGB and alpha 1 across every frame');
    await chooseFrame(1); assert((await png()).equals(rgba(gridFrames[1])), 'An imported cel exports its exact native PNG bytes');
    const invalidPath = join(temporary, 'invalid-manifest.json'); await writeFile(invalidPath, JSON.stringify({ ...manifest, width: 1 }));
    await uploadFile('animation-sheet-manifest', invalidPath); await change('sheet-import-mode', 'manifest');
    const beforeInvalid = await project(); await click('import-animation-sheet'); await waitFor("!document.getElementById('import-animation-sheet').disabled"); await ready(true);
    assert(await evaluate("document.getElementById('status').classList.contains('error')"), 'A mismatched manifest is rejected with a visible error');
    assert(equal(await project(), beforeInvalid), 'Failed sheet import leaves all current frames and active selection unchanged');

    phase = 'concurrent import and native gesture';
    await change('sheet-import-mode', 'grid');
    await change('paint-tool', 'pencil');await change('paint-color','#ff00ff');await change('paint-size',1);
    await evaluate("(()=>{const original=File.prototype.arrayBuffer;window.__restoreFileRead=()=>{File.prototype.arrayBuffer=original;};File.prototype.arrayBuffer=function(){if(this.name!=='large-grid.png')return original.call(this);const file=this;return new Promise(resolve=>{window.__resumeSheetRead=()=>resolve(original.call(file));});};})()");
    await click('import-animation-sheet');await waitFor('typeof window.__resumeSheetRead===\"function\"');
    await evaluate("document.getElementById('result').scrollIntoView({block:'center',inline:'center'})");
    const point=await evaluate("(()=>{const c=document.getElementById('result'),r=c.getBoundingClientRect();return {x:r.left+2.5*r.width/c.width,y:r.top+1.5*r.height/c.height};})()");
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',buttons:1,clickCount:1});
    await evaluate('window.__resumeSheetRead();window.__restoreFileRead();');
    await waitFor("!document.getElementById('import-animation-sheet').disabled");await ready(true);
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',buttons:0,clickCount:1});
    assert(await evaluate("document.getElementById('status').classList.contains('error')&&document.getElementById('status').textContent.includes('작업이 변경')"),'A stroke started during asynchronous decoding cancels the stale sheet import');
    const afterRace=await project(),raceFrame=afterRace.frames.find(frame=>frame.id===afterRace.activeFrameId);
    assert(raceFrame.document.layers.some(layer=>layer.kind==='paint')&&(await png()).equals(Buffer.from(gridFrames[1].flatMap((c,i)=>i===174?[255,0,255,255]:[c&255,c>>>8&255,c>>>16&255,c>>>24]))),'The in-progress native stroke remains committed and exportable after import cancellation');

    phase = 'Adam7 exact import';
    // The external encoder corpus has an independent raw-RGBA oracle.
    const corpus = JSON.parse(await readFile(join(process.cwd(), 'tests/fixtures/pixel-png/manifest.json'), 'utf8'));
    const adam=corpus.images['rgba-all-passes'];
    await uploadFile('png-file',join(process.cwd(),'tests/fixtures/pixel-png/rgba-all-passes.png'));
    await waitFor("document.getElementById('png-file').value===''"); await ready();
    assert(await evaluate("document.getElementById('import-note').textContent.includes('그대로')"), 'Adam7 PNG uses the exact native decoder in the real browser');
    assert((await png()).equals(Buffer.from(adam.rgba)),'Actual-browser Adam7 import/export matches the external encoder oracle, including RGB under zero and one alpha');

    phase = 'responsive layout and runtime';
    await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
    await evaluate("document.querySelector('.production-panel').open=true;document.querySelector('.sheet-import').open=true;"); await ready();
    assert(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'), 'Expanded color and sheet controls fit a 390px viewport');
    assert(browser.exceptions.length === 0 && await evaluate('window.__pokuUnhandled.length===0'), 'Authoring workflow completes without uncaught browser errors');
    if (process.env.PIXEL_ART_PRODUCTION_SCREENSHOT_PATH) {
      await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1200, deviceScaleFactor: 1, mobile: false }); await ready();
      await evaluate("document.querySelector('.production-panel').scrollIntoView({block:'center'})");
      const shot = await send('Page.captureScreenshot', { format: 'png' });
      await mkdir(dirname(process.env.PIXEL_ART_PRODUCTION_SCREENSHOT_PATH), { recursive: true }); await writeFile(process.env.PIXEL_ART_PRODUCTION_SCREENSHOT_PATH, Buffer.from(shot.data, 'base64'));
    }
    return { status: 'passed', checks: checks.length, evidence: checks };
  });
} catch (error) {
  if (error instanceof BrowserUnavailable && process.env.PIXEL_ART_PRODUCTION_REQUIRED !== '1') report = { status: 'skipped', reason: String(error), checks: checks.length };
  else { report = { status: 'failed', phase, error: String(error), checks: checks.length, evidence: checks }; process.exitCode = 1; }
} finally {
  await rm(temporary, { recursive: true, force: true });
  if (process.env.PIXEL_ART_PRODUCTION_REPORT_PATH) { await mkdir(dirname(process.env.PIXEL_ART_PRODUCTION_REPORT_PATH), { recursive: true }); await writeFile(process.env.PIXEL_ART_PRODUCTION_REPORT_PATH, JSON.stringify(report, null, 2) + '\n'); }
  console.log(JSON.stringify(report, null, 2));
}
