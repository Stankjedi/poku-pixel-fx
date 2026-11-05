import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';
const checks = [];
const assert = (condition, description) => { if (!condition) throw new Error(description); checks.push(description); };
const temporary = await mkdtemp(join(tmpdir(), 'poku-studio-qa-'));
let report;
try {
  report = await withHarnessBrowser(async browser => {
    const { evaluate, waitFor, send } = browser;
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const project = () => evaluate("JSON.parse(document.getElementById('project-json').value)");
    const painted = () => evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)))));
    // A concrete state predicate plus autosave completion avoids localized status-string races.
    const ready = async (predicate = 'true') => { await waitFor(`(()=>{const e=document.getElementById('project-json'),s=document.getElementById('status');if(s?.style.color)throw new Error(s.textContent);if(!e?.value)return false;const p=JSON.parse(e.value);return (${predicate})&&localStorage.getItem('poku-studio-autosave')===e.value;})()`); await painted(); };
    const change = (id, value, event = 'change') => evaluate(`{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));}`);
    const frameIndex = () => evaluate(() => { const found = /\bf(\d+)\s*$/.exec(document.getElementById('time').textContent); if (!found) throw new Error('Displayed frame index is missing'); return Number(found[1]); });
    const seek = async index => { const p = await project(); await change('timeline', String(index / p.fps), 'input'); await painted(); assert(await frameIndex() === index, `Paused timeline displays frame ${index}`); };
    const selectOption = (option, value) => evaluate(`(()=>{const e=[...document.querySelectorAll('#character-controls select')].find(s=>[...s.options].some(o=>o.value===${JSON.stringify(option)}));if(!e)throw new Error('Character control missing');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    const mouseCell = async cell => {
      const point = await evaluate(`(()=>{const e=document.getElementById('stage'),r=e.getBoundingClientRect();if(document.getElementById('zoom').value!=='2')throw new Error('Pointer test requires physical 2x zoom');const vx=Math.floor((e.width-${cell.width}*2)/2),vy=Math.floor((e.height-${cell.height}*2)/2),x=vx+(${cell.x}+.5)*2,y=vy+(${cell.y}+.5)*2;if(x<0||y<0||x>=e.width||y>=e.height)throw new Error('Brush target is clipped');return{x:r.left+x*r.width/e.width,y:r.top+y*r.height/e.height};})()`);
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', buttons: 0, clickCount: 1 });
    };
    await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 2, mobile: false });
    await browser.navigate('/gallery/studio.html'); await ready(); await waitFor("document.getElementById('performance').textContent.startsWith('CPU')");
    assert(await evaluate("document.querySelectorAll('#recipes button').length") === 6, 'Studio boots all six recipe buttons using real bundled modules');
    const kinds = ['thrown-blade', 'ribbon-slash', 'lightning', 'explosion', 'flame', 'portal'];
    for (let i = 0; i < 6; i++) {
      await evaluate(`document.querySelectorAll('#recipes button')[${i}].click()`); await ready(`p.kind==='recipe'&&p.recipe.kind===${JSON.stringify(kinds[i])}`);
      const p = await project(); assert(p.kind === 'recipe' && p.recipe?.kind, `Recipe ${i + 1} resolves into an editable project: ${p.recipe?.kind}`);
      await click('restart'); await click('next'); await waitFor("/· f1$/.test(document.getElementById('time').textContent)");
    }
    assert(true, 'Each recipe seeks exactly one frame without accumulating playback time');
    await change('search', 'melee/double-slash', 'input');
    await evaluate(() => { const e = [...document.querySelectorAll('#results button')].find(e => e.querySelector('small')?.textContent === 'melee/double-slash'); if (!e) throw new Error('ACT catalog entry missing'); e.click(); });
    await ready("p.kind==='act'&&p.id==='melee/double-slash'");
    const marker = await evaluate(() => { const e = [...document.querySelectorAll('#markers button[data-source-time]')].find(e => Math.abs(Number(e.dataset.sourceTime) - .16) < 1e-9); if (!e) return null; return { source: Number(e.dataset.sourceTime), elapsed: Number(e.dataset.elapsedTime), frame: Number(e.dataset.frame) }; });
    assert(!!marker && marker.elapsed >= .62 && marker.elapsed <= .67, 'ACT second contact marker includes negative windup and the first hit-stop');
    await evaluate(() => [...document.querySelectorAll('#markers button[data-source-time]')].find(e => Math.abs(Number(e.dataset.sourceTime) - .16) < 1e-9).click()); await painted();
    assert(await frameIndex() === marker.frame, 'ACT marker click seeks its first displayed contact frame');
    await change('new-character-height', '64'); await click('new-character'); await ready("p.kind==='character'&&p.character.nativeHeight===64");
    assert((await project()).character.nativeHeight === 64, 'Character creation honors the selected native height');
    await selectOption('wayfarer-cape', ''); await ready("p.character.clips[p.options.clip].loadout.back===null");
    assert(await evaluate(() => [...document.querySelectorAll('#character-controls select')].find(s => [...s.options].some(o => o.value === 'wayfarer-cape')).value) === '', 'Explicit null equipment overrides the base cape and remains empty in the UI');
    await selectOption('wayfarer-cape', 'wayfarer-cape'); await ready("p.character.clips[p.options.clip].loadout.back==='wayfarer-cape'");
    assert(await evaluate("[...document.querySelectorAll('#edit-target option')].some(o=>o.value==='cape')"), 'Equipped layers are offered as distinct edit targets');
    await selectOption('key-strike', 'key-strike'); await ready("p.options.clip==='key-strike'");
    await evaluate(() => { const e = [...document.querySelectorAll('#character-controls select')].find(s => [...s.options].map(o => o.value).join() === 'hold,linear,smooth'); if (!e) throw new Error('Key-pose hold control missing'); e.value = 'linear'; e.dispatchEvent(new Event('change', { bubbles: true })); });
    await ready("p.character.clips['key-strike'].poses.keys[0].interpolation==='linear'"); assert(true, 'Key-pose hold/linear interpolation control persists the selected policy');
    const eventProject = await project(), clip = eventProject.character.clips['key-strike'], eventCount = (clip.events ?? clip.poses.events ?? []).length;
    await seek(2);
    await evaluate(() => { const e = [...document.querySelectorAll('#character-controls select')].find(s => [...s.options].map(o => o.value).join() === 'hold,linear,smooth'), add = e.closest('details').querySelector(':scope > button:last-child'); if (!add) throw new Error('Timeline event control missing'); add.click(); });
    await ready(`p.character.clips['key-strike'].events?.length===${eventCount + 1}`);
    assert((await project()).character.clips['key-strike'].events.at(-1).kind === 'contact', 'Timeline contact insertion persists a distinct event');
    const transformed = await project(); transformed.name = 'Studio transformed cel test'; transformed.options.clip = 'idle'; transformed.options.flip = true; transformed.options.angle = .37; transformed.fps = 10; transformed.seconds = .6; transformed.character.clips.idle.fps = 240;
    await change('project-json', JSON.stringify(transformed)); await click('apply-json'); await ready("p.name==='Studio transformed cel test'&&p.options.clip==='idle'");
    await change('zoom', '2'); await painted();
    const sizing = await evaluate(() => { const e = document.getElementById('stage'), r = e.getBoundingClientRect(); return { width: e.width, height: e.height, cssWidth: r.width, cssHeight: r.height, dpr: devicePixelRatio }; });
    assert(sizing.dpr === 2 && sizing.width / sizing.cssWidth > 1.9 && sizing.height / sizing.cssHeight > 1.9, 'Pointer checks exercise a real HiDPI CSS/backing-store size difference');
    await click('restart'); await click('play'); await waitFor("Number(document.getElementById('timeline').value)>.105");
    await change('brush', 'color'); await painted(); await change('brush-color', '#ff2488'); await change('brush-size', '1'); await change('edit-target', 'body');
    const visibleFrame = await frameIndex();
    const cell = await evaluate(`(async()=>{const {createProjectRuntime}=await import('/build/authoring/runtime.js');const p=JSON.parse(document.getElementById('project-json').value),r=await createProjectRuntime(p);try{const sample=r.render(${visibleFrame}/p.fps,${visibleFrame}),mask=sample.frame.semanticMasks.body,w=r.width,h=r.height;let pick=-1,best=Infinity;for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!mask?.[i]||!mask[i-1]||!mask[i+1]||!mask[i-w]||!mask[i+w])continue;const d=(x-w/2)**2+(y-h/2)**2;if(d<best){best=d;pick=i;}}if(pick<0)throw new Error('No interior body cell');const x=pick%w,y=Math.floor(pick/w),dx=x+.5-r.origin[0],dy=y+.5-r.origin[1],c=Math.cos(p.options.angle),s=Math.sin(p.options.angle);return{x,y,width:w,height:h,localX:Math.floor(-(c*dx+s*dy)),localY:Math.floor(-s*dx+c*dy),celFrame:Math.floor(sample.time*p.character.clips.idle.fps)};}finally{r.dispose();}})()`);
    const beforeBrush = (await project()).character.celEdits?.length ?? 0;
    await mouseCell(cell); await ready(`p.character.celEdits.length===${beforeBrush + 1}`);
    const firstStroke = (await project()).character.celEdits.at(-1);
    assert(firstStroke.frame === cell.celFrame && firstStroke.patch.x === cell.localX && firstStroke.patch.y === cell.localY, 'Actual pointer brush uses the displayed cel and inverse flip/rotation under HiDPI');
    await click('undo'); await ready(`(p.character.celEdits?.length??0)===${beforeBrush}`);
    await click('redo'); await ready(`p.character.celEdits.length===${beforeBrush + 1}`);
    assert((await project()).character.celEdits.at(-1).id === firstStroke.id, 'Undo and redo preserve the exact cel edit revision');
    await click('save'); await waitFor("[...document.querySelectorAll('#downloads a')].some(a=>a.download.endsWith('.poku-project.json'))");
    const downloaded = await evaluate(async () => { const a = [...document.querySelectorAll('#downloads a')].filter(a => a.download.endsWith('.poku-project.json')).at(-1); return (await fetch(a.href)).json(); });
    assert(downloaded.name === transformed.name && downloaded.character.celEdits.at(-1).id === firstStroke.id, 'Project save preserves the actual cel edit');
    const savedPath = join(temporary, 'reopen.poku-project.json'); await writeFile(savedPath, JSON.stringify(downloaded));
    assert(!(await evaluate('window.__pokuUnhandled')).length, 'No uncaught errors before project reload');
    const previousDocument = await evaluate('performance.timeOrigin'); await send('Page.reload');
    let reloaded = false;
    for (let i = 0; i < 375 && !reloaded; i++) {
      try { reloaded = await evaluate(`performance.timeOrigin!==${previousDocument}&&document.readyState!=='loading'`); }
      catch (error) { if (!/context|navigation/i.test(String(error))) throw error; }
      if (!reloaded) await new Promise(resolve => setTimeout(resolve, 40));
    }
    if (!reloaded) throw new Error('Fresh document did not load after reload');
    await ready(`p.character?.celEdits?.at(-1)?.id===${JSON.stringify(firstStroke.id)}`);
    const dom = await send('DOM.getDocument'), upload = await send('DOM.querySelector', { nodeId: dom.root.nodeId, selector: '#open-file' });
    await send('DOM.setFileInputFiles', { nodeId: upload.nodeId, files: [savedPath] }); await waitFor("document.getElementById('open-file').value===''");
    await ready(`p.character?.celEdits?.at(-1)?.id===${JSON.stringify(firstStroke.id)}`); await change('zoom', '2'); await seek(visibleFrame);
    await change('brush', 'color'); await change('brush-color', '#12ddee'); await change('brush-size', '1'); await change('edit-target', 'body');
    await mouseCell(cell); await ready(`p.character.celEdits.length===${beforeBrush + 2}`);
    const secondStroke = (await project()).character.celEdits.at(-1);
    assert(secondStroke.id !== firstStroke.id && secondStroke.frame === firstStroke.frame && secondStroke.patch.x === firstStroke.patch.x && secondStroke.patch.y === firstStroke.patch.y, 'File reopens after a fresh module load and the second stroke on the same cell receives a new UUID');
    const beforeMasks = (await project()).character.maskEdits?.length ?? 0;
    await change('brush', 'mask'); await change('mask-name', 'featureMask'); await change('mask-operation', '+');
    await mouseCell(cell); await ready(`p.character.maskEdits.length===${beforeMasks + 1}`);
    await change('mask-operation', '-'); await mouseCell(cell); await ready(`p.character.maskEdits.length===${beforeMasks + 2}`);
    const masks = (await project()).character.maskEdits.slice(-2);
    assert(masks.every(e => e.target === 'body' && e.name === 'featureMask') && masks[0].rows[0] === '+' && masks[1].rows[0] === '-', 'Semantic-mask add/remove operations persist on the selected layer');
    const saved = await project(); saved.name = 'Studio browser round trip'; saved.seconds = .2;
    if (saved.renderProfile) delete saved.renderProfile.mode;
    const palette = [0xff112233, 0xff7799bb, 0xffddf1ef];
    saved.pixelStyle = { nativeResolution: [cell.width, cell.height], surfaceColors: 'indexed', palette, quantization: 'nearest', finalColorPolicy: 'palette-locked', emission: 'palette-stepped', alpha: 'coverage', outline: 'none' };
    await change('project-json', JSON.stringify(saved)); await click('apply-json'); await ready("p.name==='Studio browser round trip'"); await seek(1);
    await change('alpha-policy', 'authored-dither'); await ready("p.pixelStyle.alpha==='authored-dither'");
    await change('outline-policy', 'silhouette'); await ready("p.pixelStyle.outline==='silhouette'");
    await change('dither-anchor', 'world'); await ready("p.pixelStyle.dither.anchor==='world'");
    assert(JSON.stringify((await project()).pixelStyle.palette) === JSON.stringify(palette), 'Alpha, outline and dither edits preserve an imported palette');
    await click('save-frame'); await waitFor("!!document.querySelector('#downloads a[download$=\".png\"]')");
    const pngColors = await evaluate(async () => { const a = [...document.querySelectorAll('#downloads a')].filter(a => a.download.endsWith('.png')).at(-1), bitmap = await createImageBitmap(await (await fetch(a.href)).blob()), canvas = document.createElement('canvas'); canvas.width = bitmap.width; canvas.height = bitmap.height; const context = canvas.getContext('2d'); context.drawImage(bitmap, 0, 0); bitmap.close(); const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data, colors = new Set(); for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3]) colors.add((rgba[i] | rgba[i + 1] << 8 | rgba[i + 2] << 16) >>> 0); return [...colors]; });
    assert(pngColors.length > 0 && pngColors.every(c => palette.some(p => (p & 0xffffff) === c)), 'Actual saved PNG respects the final palette after composition');
    // Explicit availability fault injection tests fallback, not a claim of hardware validation.
    await evaluate(() => { window.__savedGPUProperty = Object.getOwnPropertyDescriptor(navigator, 'gpu'); Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }); });
    await change('backend', 'webgpu'); await ready("p.renderProfile.backend==='webgpu'"); await waitFor("document.getElementById('performance').textContent.startsWith('CPU')");
    assert((await project()).renderProfile.backend === 'webgpu', 'Unavailable WebGPU API falls back to a rendered CPU frame while retaining the requested backend');
    await evaluate(() => { if (window.__savedGPUProperty) Object.defineProperty(navigator, 'gpu', window.__savedGPUProperty); else delete navigator.gpu; delete window.__savedGPUProperty; }); await change('backend', 'cpu'); await ready("p.renderProfile.backend==='cpu'");
    // Selecting WebGPU explicitly selects cinematic finishing; returning to CPU keeps it.
    // Reapply the latest edited project with only its mode omitted before testing the default.
    const defaultFinishing = await project(); delete defaultFinishing.renderProfile.mode;
    await change('project-json', JSON.stringify(defaultFinishing)); await click('apply-json');
    await ready("p.renderProfile.backend==='cpu'&&!Object.hasOwn(p.renderProfile,'mode')");
    assert(!Object.hasOwn((await project()).renderProfile, 'mode'), 'Default-finishing export starts from an applied and autosaved project with its mode omitted');
    await click('export'); await waitFor("!!document.querySelector('#downloads a[download$=\".zip\"]')", 55000);
    const bundle = await evaluate(async () => {
      const links = [...document.querySelectorAll('#downloads a')], assetLink = links.find(a => a.download === 'asset.json'), zipLink = links.find(a => a.download.endsWith('.zip'));
      const manifest = await (await fetch(assetLink.href)).json(), zip = new Uint8Array(await (await fetch(zipLink.href)).arrayBuffer());
      const files = new Map(); let cursor = 0;
      while (cursor + 30 <= zip.length) {
        const v = new DataView(zip.buffer, cursor); if (v.getUint32(0, true) !== 0x04034b50) break;
        if (v.getUint16(8, true) !== 0) throw new Error('Expected STORE ZIP entries');
        const size = v.getUint32(18, true), nameSize = v.getUint16(26, true), extra = v.getUint16(28, true), start = cursor + 30 + nameSize + extra;
        const name = new TextDecoder().decode(zip.subarray(cursor + 30, cursor + 30 + nameSize)); files.set(name, zip.subarray(start, start + size)); cursor = start + size;
      }
      for (const file of manifest.files) {
        const bytes = files.get(file.path); if (!bytes || bytes.length !== file.bytes) throw new Error(`ZIP file length mismatch: ${file.path}`);
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(x => x.toString(16).padStart(2, '0')).join(''); if (hash !== file.sha256) throw new Error(`ZIP hash mismatch: ${file.path}`);
      }
      const bitmap = await createImageBitmap(new Blob([files.get(manifest.pages[0].image)], { type: 'image/png' })); const size = [bitmap.width, bitmap.height]; bitmap.close();
      const stored = JSON.parse(new TextDecoder().decode(files.get('project.json')));
      return { schema: manifest.schema, frames: manifest.frames.length, files: [...files.keys()], pageSize: size, expectedSize: [manifest.pages[0].width, manifest.pages[0].height], zipBytes: zip.length, palette: manifest.settings.project.pixelStyle.palette, projectPalette: stored.pixelStyle.palette, celEdits: stored.character.celEdits.length, renderMode: manifest.settings.renderMode, profileMode: manifest.settings.renderProfile.mode, expectedMode: stored.renderProfile?.mode ?? 'legacy', sourceModeOmitted: !Object.hasOwn(stored.renderProfile ?? {}, 'mode') && !Object.hasOwn(manifest.settings.project.renderProfile ?? {}, 'mode') };
    }, 55000);
    assert(bundle.schema === 'poku-asset/v1' && bundle.frames > 0 && bundle.files.includes('project.json') && bundle.files.includes('asset.json') && bundle.pageSize.join() === bundle.expectedSize.join(), 'Worker export produces a decodable atlas and integrity-checked project/manifest ZIP');
    assert(JSON.stringify(bundle.palette) === JSON.stringify(palette) && JSON.stringify(bundle.projectPalette) === JSON.stringify(palette) && bundle.celEdits === beforeBrush + 2, 'Worker ZIP retains the imported palette and both reopened cel edits');
    assert(bundle.sourceModeOmitted && bundle.expectedMode === 'legacy' && bundle.renderMode === bundle.expectedMode && bundle.profileMode === bundle.expectedMode, `Worker manifest explicitly declares legacy finishing for an omitted project mode (sourceOmitted=${bundle.sourceModeOmitted}, project=${bundle.expectedMode}, manifest=${bundle.renderMode}, profile=${bundle.profileMode})`);
    const errors = await evaluate('window.__pokuUnhandled'); assert(!errors.length && !browser.exceptions.length, 'Studio completed without uncaught JavaScript errors or rejected promises');
    if (process.env.STUDIO_SCREENSHOT_PATH) { const screenshot = await send('Page.captureScreenshot', { format: 'png' }); await writeFile(process.env.STUDIO_SCREENSHOT_PATH, Buffer.from(screenshot.data, 'base64')); }
    // Exercise the shipped custom HTML and committed assets, not only the development gallery.
    const oldDocument = await evaluate('performance.timeOrigin'); await browser.navigate('/effects/index.html');
    let hostedLoaded = false;
    for (let i = 0; i < 375 && !hostedLoaded; i++) {
      try { hostedLoaded = await evaluate(`performance.timeOrigin!==${oldDocument}&&document.readyState!=='loading'`); }
      catch (error) { if (!/context|navigation/i.test(String(error))) throw error; }
      if (!hostedLoaded) await new Promise(resolve => setTimeout(resolve, 40));
    }
    if (!hostedLoaded) throw new Error('Hosted entry document did not load');
    await waitFor("Number(document.getElementById('count')?.textContent)>0&&!!document.querySelector('#grid .tile')");
    assert(await evaluate("!!document.getElementById('d-pixels')&&!!document.getElementById('d-studio')&&!!document.querySelector('nav a[href=\"studio.html\"]')"), 'Shipped hosted entry includes the exact-pixel and Studio controls required by app.js');
    await evaluate("document.querySelector('#grid .tile').click()"); await waitFor("document.getElementById('detail').open&&!!document.getElementById('d-id').textContent");
    await click('d-pixels'); await waitFor("document.getElementById('d-pixels').getAttribute('aria-pressed')==='true'");
    await waitFor("!!document.getElementById('community-status').textContent");
    const hosted = await evaluate(() => ({ catalogCount: Number(document.getElementById('count').textContent), offlineNotice: document.getElementById('community-status').textContent, exceptions: window.__pokuUnhandled }));
    assert(!hosted.exceptions.length && !browser.exceptions.length, 'Hosted catalog and exact-pixel control work without uncaught errors; absent community API is reported separately');
    delete hosted.exceptions; hosted.communityAPI = 'Unavailable in this static-only harness; an offline notice is expected';
    return { status: 'passed', browser: await evaluate('navigator.userAgent'), checks, export: bundle, hosted, scope: 'Real HiDPI browser UI/file-reopen/worker/hosted-entry smoke; fallback API absence injected explicitly; no aesthetic judgement or physical GPU claim' };
  });
} catch (error) { report = { status: error instanceof BrowserUnavailable ? 'unavailable' : 'failed', reason: String(error), checks }; }
finally { await rm(temporary, { recursive: true, force: true }); }
console.log(JSON.stringify(report, null, 2)); if (process.env.STUDIO_REPORT_PATH) await writeFile(process.env.STUDIO_REPORT_PATH, JSON.stringify(report, null, 2));
if (report.status === 'failed' || process.env.STUDIO_REQUIRED === '1' && report.status !== 'passed') process.exitCode = 1;
