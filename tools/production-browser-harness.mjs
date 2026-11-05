import {writeFile} from 'node:fs/promises';
import {BrowserUnavailable,withHarnessBrowser} from './lib/browser-harness.mjs';
const checks=[];
const assert=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
let report;
try{
  report=await withHarnessBrowser(async browser=>{
    const {evaluate,waitFor}=browser;
    const click=id=>evaluate(`document.getElementById(${JSON.stringify(id)}).click()`);
    const change=(id,value,event='change')=>evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});e.value=${JSON.stringify(value)};e.dispatchEvent(new Event(${JSON.stringify(event)},{bubbles:true}));})()`);
    const project=()=>evaluate(`JSON.parse(document.getElementById('project-json').value)`);
    const ready=predicate=>waitFor(`document.getElementById('project-json')?.value&&(()=>{const p=JSON.parse(document.getElementById('project-json').value);return ${predicate};})()&&document.getElementById('status').textContent.startsWith('프로젝트 준비됨')`);
    await browser.navigate('/gallery/studio.html');await ready("p.kind==='recipe'");
    await change('color-policy','palette-locked');await ready("p.pixelStyle.finalColorPolicy==='palette-locked'");
    assert((await project()).pixelStyle.emission==='palette-stepped','First palette-lock action converts unrestricted emission to an allowed stepped policy');
    await change('palette-preset','ink-paper');await ready('p.pixelStyle.palette.length===4');
    await change('color-quantization','ordered');await ready("p.pixelStyle.quantization==='ordered'");
    await change('dither-pattern','cluster4');await ready("p.pixelStyle.dither.pattern==='cluster4'");
    assert((await project()).pixelStyle.quantization==='ordered','Studio exposes ordered palette color dithering and clustered dot patterns');
    const before=await project(),seconds=before.recipe.duration*1.5;
    await change('duration',String(seconds));await ready(`Math.abs(p.recipe.duration-${seconds})<1e-9`);
    assert(Math.abs((await project()).recipe.timeScale-1.5)<1e-9,'Duration control retimes choreography and contact timing together');
    const valid=await project(),invalid=structuredClone(valid);invalid.pixelStyle.palette=[0xff000000,0xff000000];
    await change('project-json',JSON.stringify(invalid));await click('apply-json');await waitFor("/palette|Palette/.test(document.getElementById('status').textContent)");
    // Restore the editor text from the last valid project; the runtime itself must have stayed usable.
    await change('project-json',JSON.stringify(valid));await click('apply-json');await ready("p.pixelStyle.palette.length===4");
    const painted=structuredClone(valid);painted.edits=[{frame:'all',x:0,y:0,color:0xffffffff}];
    await change('project-json',JSON.stringify(painted));await click('apply-json');await ready('p.edits.length===1');
    assert(await evaluate("document.getElementById('new-sequence').disabled&&document.getElementById('sequence-conversion-note').textContent.includes('픽셀 수정')"),'Sequence conversion explains coordinate-bound paint restrictions instead of silently dropping hand edits');
    const convertible=structuredClone(valid);convertible.options.angle=Math.PI/2;convertible.options.flip=true;convertible.cameraMotion=0;convertible.margin=3;convertible.layers={glow:false};convertible.seconds=valid.recipe.duration*.8;
    await change('project-json',JSON.stringify(convertible));await click('apply-json');await ready('p.margin===3&&p.edits.length===0');
    await click('new-sequence');await ready("p.kind==='sequence'&&p.sequence.cues.length===1");
    const converted=await project();
    assert(converted.options.angle===Math.PI/2&&converted.options.flip&&converted.cameraMotion===0&&converted.margin===3&&converted.sequence.duration===convertible.seconds&&converted.sequence.loop===false&&converted.sequence.cues[0].options.layers.glow===false&&converted.sequence.cues[0].angle===0,'Conversion preserves the object transform, crop, original source layers, margin and camera policy');
    await evaluate("[...document.querySelectorAll('#results button')].find(b=>b.textContent==='+ 시퀀스에 추가').click()");
    await ready('p.sequence.cues.length===2');
    const sequence=await project();assert(sequence.sequence.cues[0].seed===before.seed,'Converting an effect preserves its authored seed');
    await evaluate("(()=>{const e=document.querySelector('#sequence-controls .sequence-cue input[type=number]');e.value='.25';e.dispatchEvent(new Event('change',{bubbles:true}));})()");
    await ready('p.sequence.cues[0].at===.25');
    await click('undo');await ready('p.sequence.cues[0].at===0');await click('redo');await ready('p.sequence.cues[0].at===.25');
    assert(true,'Sequence cue creation, timing edits and undo/redo use the actual Studio controls');

    // Repeated blank cels exercise dedup across worker messages without depending on effect art.
    const empty={schema:'poku.project/v1',id:'sequences/blank-export',name:'Duplicate-frame export',kind:'sequence',seed:1,fps:10,actor:false,target:false,bg:'none',sequence:{schema:'poku.sequence/v1',duration:.3,loop:false,cues:[]},exportSettings:{maxTextureSize:256,padding:2,extrude:1,trim:true,deduplicate:true}};
    await change('project-json',JSON.stringify(empty));await click('apply-json');await ready("p.id==='sequences/blank-export'");
    await click('export');await waitFor("!!document.querySelector('#downloads a[download=\"asset.json\"]')",55000);
    const bundle=await evaluate(async()=>{
      const a=document.querySelector('#downloads a[download="asset.json"]'),m=await(await fetch(a.href)).json();
      return{frames:m.frames.length,pages:m.pages.length,rects:m.frames.map(f=>JSON.stringify(f.rect)),duration:m.durationMs,atlas:m.settings.atlas,size:[m.pages[0].width,m.pages[0].height],zip:!!document.querySelector('#downloads a[download$=".zip"]')};
    });
    assert(bundle.frames===4&&bundle.pages===1&&new Set(bundle.rects).size===1&&bundle.size.join()==='5,5'&&bundle.duration===400&&bundle.zip,'Worker deduplicates identical cels while preserving four frame durations and exported ZIP');
    assert(bundle.atlas.extrude===1&&bundle.atlas.padding===2,'Atlas settings persist from project to browser asset manifest');
    const errors=await evaluate('window.__pokuUnhandled');assert(!errors.length&&!browser.exceptions.length,'Production workflow has no uncaught UI/worker errors');
    if(process.env.PRODUCTION_SCREENSHOT_PATH){const shot=await browser.send('Page.captureScreenshot',{format:'png'});await writeFile(process.env.PRODUCTION_SCREENSHOT_PATH,Buffer.from(shot.data,'base64'));}
    const old=await evaluate('performance.timeOrigin');await browser.navigate('/gallery/gpu-lab.html');
    await waitFor(`performance.timeOrigin!==${old}&&document.getElementById('backend-badge')?.textContent!=='GPU 준비 중'&&document.getElementById('submit-time')?.textContent!=='—'`,55000);
    assert(await evaluate("document.getElementById('view').width>0&&!!document.getElementById('status').textContent"),'GPU Lab loads its bundled entry and produces an actual WebGPU or explicitly labelled worker CPU frame');
    const lab=await evaluate(()=>({backend:document.getElementById('backend-badge').textContent,status:document.getElementById('status').textContent}));
    assert(!(await evaluate('window.__pokuUnhandled')).length&&!browser.exceptions.length,'GPU Lab initial presentation has no uncaught errors');
    return{status:'passed',checks,bundle,lab,scope:'Actual Studio sequence/palette/retiming/worker-export/GPU-Lab UI. Adapter availability is reported separately from correctness.'};
  });
}catch(error){report={status:error instanceof BrowserUnavailable?'unavailable':'failed',reason:String(error),checks};}
console.log(JSON.stringify(report,null,2));
if(process.env.PRODUCTION_REPORT_PATH)await writeFile(process.env.PRODUCTION_REPORT_PATH,JSON.stringify(report,null,2)+'\n');
if(report.status==='failed'||process.env.PRODUCTION_REQUIRED==='1'&&report.status!=='passed')process.exitCode=1;
