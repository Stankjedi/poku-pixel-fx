import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { createPixelArtAnimation2D, duplicatePixelArtAnimationFrame2D } from '../build/authoring/pixel-art-animation.js';
import { BrowserUnavailable, withHarnessBrowser } from './lib/browser-harness.mjs';

const checks = [];
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); };
const color = (r,g,b,a=255) => (r | g << 8 | b << 16 | a << 24) >>> 0;
const temporary = await mkdtemp(join(tmpdir(), 'poku-pixel-recovery-qa-'));
let report, phase = 'initialization';
try {
  report = await withHarnessBrowser(async browser => {
    const {send,evaluate,waitFor} = browser;
    const click = id => evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const ready = async () => {
      await waitFor("document.getElementById('result')?.dataset.ready==='true'");
      await waitFor("document.getElementById('save-recovery-now')&&!document.getElementById('save-recovery-now').disabled");
      await evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const installReads = () => evaluate(() => {
      // Observe actual IndexedDB records through a fresh connection, not an app test hook.
      window.__readRecovery = () => new Promise((resolve,reject) => {
        const open = indexedDB.open('poku-pixel-art-recovery',1);
        open.onerror=()=>reject(open.error);
        open.onsuccess=()=>{
          const db=open.result,tx=db.transaction(['drafts','summaries']);
          const drafts=tx.objectStore('drafts').getAll(),summaries=tx.objectStore('summaries').getAll();
          tx.oncomplete=()=>{resolve({drafts:drafts.result,summaries:summaries.result});db.close();};
          tx.onabort=()=>{reject(tx.error);db.close();};
        };
      });
    });
    const records = () => evaluate('window.__readRecovery()');
    const reload = async () => { await send('Page.reload'); await ready(); await installReads(); };
    const auto = async value => {
      await evaluate(`(()=>{const e=document.getElementById('recovery-enabled');if(e.checked!==${value})e.click();})()`);
    };
    const project = async () => {
      const before=await evaluate("document.querySelector('#downloads a[download$=\".poku-pixel-art.json\"]')?.href??''");
      await click('save-project');
      await waitFor(`(()=>{const a=document.querySelector('#downloads a[download$=".poku-pixel-art.json"]');return a&&a.href!==${JSON.stringify(before)}})()`);
      return evaluate("(async()=>JSON.parse(await(await fetch(document.querySelector('#downloads a[download$=\".poku-pixel-art.json\"]').href)).text()))()");
    };
    const upload = async (name,data) => {
      const path=join(temporary,name);await writeFile(path,JSON.stringify(data));
      const dom=await send('DOM.getDocument'),input=await send('DOM.querySelector',{nodeId:dom.root.nodeId,selector:'#project-file'});
      await send('DOM.setFileInputFiles',{nodeId:input.nodeId,files:[path]});
      await waitFor("document.getElementById('project-file').value===''");await ready();
      assert(!await evaluate("document.getElementById('status').classList.contains('error')"),'The actual file picker accepts '+name);
    };
    const swatch = async (index,value) => {
      await evaluate(`(()=>{const e=document.querySelectorAll('#workbench-palette input')[${index}];if(!e)throw new Error('Missing saved swatch');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    };
    const saved = async expected => {
      await waitFor(`(async()=>{const r=await window.__readRecovery();return r.drafts.some(d=>d.json===${JSON.stringify(JSON.stringify(expected))});})()`);
      return (await records()).drafts.find(d=>d.json===JSON.stringify(expected));
    };
    const saveNow = async () => {const expected=await project();await click('save-recovery-now');await saved(expected);return expected;};
    const choose = async id => evaluate(`document.getElementById('recovery-list').value=${JSON.stringify(id)}`);
    const restore = async id => {await choose(id);await click('restore-recovery');await waitFor("document.getElementById('recovery-status').dataset.state==='restored'");await ready();};

    await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
    await browser.navigate('/gallery/pixel-art-lab.html');await ready();await installReads();
    const initial=await records();assert(initial.drafts.length===0&&initial.summaries.length===0,'Opening the default study does not create or overwrite a recovery record');

    phase='exact project and swatch recovery after reload';
    const w=12,h=10,palette=[color(23,48,66),color(103,169,144),color(245,224,176,128)];
    const original={schema:'poku-pixel-art/v2',name:'Recovery exact RGBA',width:w,height:h,
      pixels:Array.from({length:w*h},(_,i)=>color(40+i%7*20,80+i%5*20,160-i%6*15,[255,128,1,0][i%4])),
      mask:Array.from({length:w*h},(_,i)=>i===3?0:1),workingPalette:palette,
      layers:[{kind:'height',id:'height-1',name:'Authored ridge',indices:[13,14,15],deltas:[1.5,3,1.5],wrap:true}],
      protectedMask:Array.from({length:w*h},(_,i)=>Number(i===13)),selection:Array.from({length:w*h},(_,i)=>Number(i%w<7))};
    await upload('recovery-still.json',original);
    assert(isDeepStrictEqual(await evaluate("[...document.querySelectorAll('#workbench-palette input')].map(e=>e.value)"),['#173042','#67a990','#f5e0b0']),
      'Opening a document restores its working swatches without applying a palette adjustment');
    await swatch(0,'#213b57');const authored=await project(),first=await saved(authored);
    assert(authored.workingPalette[0]===color(33,59,87)&&isDeepStrictEqual(authored.pixels,original.pixels)&&authored.layers.length===1,
      'A changed workspace swatch is serialized without modifying artwork RGBA or adding a rendering layer');
    await reload();
    assert((await records()).drafts.some(d=>d.id===first.id&&d.json===first.json),'Reload retains the successful previous recovery transaction');
    assert((await project()).width!==w,'Recovery remains an explicit choice and does not silently replace the opening canvas');
    await restore(first.id);const reopened=await project();
    assert(isDeepStrictEqual(reopened,authored),'Restoring a browser record reproduces source RGB, partial and hidden alpha, silhouette, masks, height layers and working palette');

    phase='restore during an active source-selection gesture';
    await click('clear-selection');
    await evaluate("document.getElementById('selection-tool').value='paint';document.getElementById('brush-size').value='1';document.getElementById('source').scrollIntoView({block:'center'})");
    const sourcePoint=async(x,y)=>evaluate(`(()=>{const c=document.getElementById('source'),r=c.getBoundingClientRect();return{x:r.left+(${x}+.5)*r.width/c.width,y:r.top+(${y}+.5)*r.height/c.height};})()`);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',...await sourcePoint(1,1),button:'left',buttons:1,clickCount:1});
    await restore(first.id);
    await evaluate("document.getElementById('source').scrollIntoView({block:'center'})");
    const moved=await sourcePoint(8,8);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',...moved,button:'left',buttons:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',...moved,button:'left',buttons:0,clickCount:1});
    assert(isDeepStrictEqual(await project(),authored),'Restoring ends and releases an active source-selection gesture so subsequent pointer movement cannot edit the restored document');

    phase='independent tab writers, deletion and forced backup';
    await swatch(1,'#8a6134');const current=await saveNow(),currentRecord=await saved(current);
    assert(currentRecord.id!==first.id&&(await records()).drafts.some(d=>d.id===first.id&&d.json===first.json),
      'A reopened tab writes to a new record instead of overwriting its previous recovery source');
    await auto(false);await choose(currentRecord.id);await click('delete-recovery');
    await waitFor(`(async()=>!(await window.__readRecovery()).drafts.some(d=>d.id===${JSON.stringify(currentRecord.id)}))()`);
    assert(isDeepStrictEqual(await project(),current),'Deleting a recovery record keeps the current editable drawing and swatches');
    await restore(first.id);
    assert(isDeepStrictEqual(await project(),authored)&&(await records()).drafts.some(d=>d.json===JSON.stringify(current)),
      'Restore makes a durable backup of the current drawing even after its own recovery record was deleted');
    await reload();
    assert(await evaluate('document.getElementById("recovery-list").value')===first.id,
      'Reload before further editing offers the restored source, while the pre-restore backup remains available');
    await restore(first.id);await auto(false);

    phase='atomic storage failure and explicit resave';
    const durable=await saveNow();let baseline=await records();
    await swatch(0,'#9e3468');
    await evaluate(() => {
      window.__originalRecoveryPut=IDBObjectStore.prototype.put;
      window.__failRecoverySummary=true;
      IDBObjectStore.prototype.put=function(...args){
        if(this.name==='summaries'&&window.__failRecoverySummary){window.__failRecoverySummary=false;throw new DOMException('Injected summary write failure','QuotaExceededError');}
        return window.__originalRecoveryPut.apply(this,args);
      };
    });
    await click('save-recovery-now');await waitFor("document.getElementById('recovery-status').dataset.state==='error'");
    await evaluate('IDBObjectStore.prototype.put=window.__originalRecoveryPut');
    assert(isDeepStrictEqual(await records(),baseline),'A synchronous second-store failure aborts the transaction and preserves both previous data and summary stores');
    const retried=await saveNow(),retryRecord=await saved(retried);
    assert(retried.workingPalette[0]===color(158,52,104),'Explicit save can recover after a failed storage transaction');
    await evaluate(`(async()=>{const db=await new Promise((ok,fail)=>{const r=indexedDB.open('poku-pixel-art-recovery',1);r.onsuccess=()=>ok(r.result);r.onerror=()=>fail(r.error);});await new Promise((ok,fail)=>{const tx=db.transaction(['drafts','summaries'],'readwrite');tx.objectStore('drafts').delete(${JSON.stringify(retryRecord.id)});tx.objectStore('summaries').delete(${JSON.stringify(retryRecord.id)});tx.oncomplete=ok;tx.onabort=()=>fail(tx.error);});db.close();})()`);
    await click('save-recovery-now');await saved(retried);
    assert((await records()).drafts.some(d=>d.json===JSON.stringify(retried)),
      'Explicit save recreates unchanged data after another storage connection deletes its record');

    phase='turning off autosave during an in-flight write';
    await auto(false);await swatch(0,'#775533');const beforeOff=await project();
    await evaluate(() => {
      window.__originalRecoveryPut=IDBObjectStore.prototype.put;window.__interruptRecoveryAuto=true;
      IDBObjectStore.prototype.put=function(...args){
        if(this.name==='drafts'&&window.__interruptRecoveryAuto){
          window.__interruptRecoveryAuto=false;
          queueMicrotask(()=>{document.getElementById('recovery-enabled').click();const s=document.querySelector('#workbench-palette input');s.value='#123456';s.dispatchEvent(new Event('input',{bubbles:true}));s.dispatchEvent(new Event('change',{bubbles:true}));});
        }
        return window.__originalRecoveryPut.apply(this,args);
      };
    });
    await auto(true);
    await saved(beforeOff);await waitFor("!document.getElementById('recovery-enabled').checked");
    await evaluate('IDBObjectStore.prototype.put=window.__originalRecoveryPut');
    await evaluate(()=>new Promise(resolve=>setTimeout(resolve,1300)));
    const afterOff=await project(),afterOffRecords=await records();
    assert(afterOff.workingPalette[0]===color(18,52,86)&&!afterOffRecords.drafts.some(d=>d.json===JSON.stringify(afterOff)),
      'Disabling autosave during a pending transaction prevents subsequent edits from being drained into storage');
    await saveNow();assert((await records()).drafts.some(d=>d.json===JSON.stringify(afterOff)),
      'The manual recovery-save button still works when automatic saving is disabled');

    phase='animation and shared palette recovery';
    let animation=duplicatePixelArtAnimationFrame2D(createPixelArtAnimation2D(original,{durationMs:75,direction:'pingpong'}));
    animation.name='Independent cel recovery';animation.frames[1].durationMs=180;
    animation.frames[1].document.layers[0].deltas[1]=7.25;
    animation.workingPalette=[color(31,49,73),color(216,167,102)];
    await upload('recovery-animation.json',animation);const sequence=await saveNow(),sequenceRecord=await saved(sequence);
    assert(sequence.schema==='poku-pixel-art/v3'&&sequence.frames.length===2&&isDeepStrictEqual(sequence.workingPalette,animation.workingPalette),
      'A multi-cel project stores its shared workspace palette independently of each cel palette');
    await evaluate("document.querySelectorAll('#frame-list button')[0].click()");await ready();
    assert(isDeepStrictEqual(await evaluate("[...document.querySelectorAll('#workbench-palette input')].map(e=>e.value)"),['#1f3149','#d8a766']),
      'Switching cels retains the shared working palette');
    await reload();await restore(sequenceRecord.id);
    assert(isDeepStrictEqual(await project(),sequence),'Reload and recovery preserve independent cel geometry, authored frame durations, direction and shared swatches');

    phase='existing full-size palette compatibility';
    const fullPalette=Array.from({length:256},(_,i)=>color(i,255-i,i));
    await upload('recovery-palette-256.json',{...original,workingPalette:undefined,
      layers:[{kind:'palette',id:'full-palette',name:'Existing 256-color palette',palette:fullPalette,strength:0}]});
    await evaluate("[...document.querySelectorAll('#layer-list button')].find(b=>b.title.endsWith('팔레트 수정')).click()");
    const fullPaletteProject=await project();
    assert(fullPaletteProject.workingPalette.length===256&&fullPaletteProject.layers.length===1
      &&fullPaletteProject.layers[0].id==='full-palette',
    'Reopening a valid 256-color palette layer remains saveable with all workspace swatches and the same layer ID');
    await restore(sequenceRecord.id);

    phase='recovery controls and failure visibility';
    const beforeCorrupt=await project();
    await evaluate(`(async()=>{const db=await new Promise(ok=>{const r=indexedDB.open('poku-pixel-art-recovery',1);r.onsuccess=()=>ok(r.result);});await new Promise((ok,fail)=>{const tx=db.transaction(['drafts','summaries'],'readwrite'),s={id:'corrupt-proof',name:'Invalid recovery proof',frames:1,updatedAt:Date.now(),bytes:9};tx.objectStore('drafts').put({...s,schema:'poku-pixel-art-recovery/v1',json:'{invalid'});tx.objectStore('summaries').put(s);tx.oncomplete=ok;tx.onabort=()=>fail(tx.error);});db.close();})()`);
    await reload();await restore(sequenceRecord.id);
    await choose('corrupt-proof');await click('restore-recovery');await waitFor("document.getElementById('recovery-status').dataset.state==='error'");
    assert(isDeepStrictEqual(await project(),beforeCorrupt),'An invalid stored project reports a recoverable error and leaves the current validated artwork intact');
    await restore(sequenceRecord.id);
    await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:2,mobile:true});
    await evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const mobile=await evaluate(()=>({viewport:innerWidth,width:document.documentElement.scrollWidth,right:document.getElementById('recovery-list').getBoundingClientRect().right}));
    assert(mobile.width<=mobile.viewport+1&&mobile.right<=mobile.viewport+1,'Recovery controls and long draft names fit the 390px viewport');
    assert(!(await evaluate('window.__pokuUnhandled')).length&&!browser.exceptions.length,'Storage failure, reload and restore complete without uncaught errors or rejected promises');
    if(process.env.PIXEL_ART_RECOVERY_SCREENSHOT_PATH){
      await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
      await evaluate('window.scrollTo(0,0)');
      const capture=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      await mkdir(dirname(process.env.PIXEL_ART_RECOVERY_SCREENSHOT_PATH),{recursive:true});await writeFile(process.env.PIXEL_ART_RECOVERY_SCREENSHOT_PATH,Buffer.from(capture.data,'base64'));
    }
    return {status:'passed',checks,source:'Actual Chromium UI and IndexedDB; injected second-store failure and external deletion explicitly identified above.'};
  });
}catch(error){report={status:error instanceof BrowserUnavailable?'unavailable':'failed',phase,reason:String(error.stack??error),checks};if(!(error instanceof BrowserUnavailable)||process.env.PIXEL_ART_RECOVERY_REQUIRED==='1')process.exitCode=1;}
finally{await rm(temporary,{recursive:true,force:true});}
if(process.env.PIXEL_ART_RECOVERY_REPORT_PATH){await mkdir(dirname(process.env.PIXEL_ART_RECOVERY_REPORT_PATH),{recursive:true});await writeFile(process.env.PIXEL_ART_RECOVERY_REPORT_PATH,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify(report,null,2));
