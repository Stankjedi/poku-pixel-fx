// Bounded VM/DOM inspector integration and CPU runtime tests, not browser or aesthetic review.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import * as controls from '../build/authoring/generation-controls.js';
import {createProject,parseProject,serializeProject,cloneJSON} from '../build/authoring/project.js';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {EditHistory} from '../build/authoring/history.js';
import {createGenerationPlan2D} from '../build/authoring/generation.js';
const studio=readFileSync(new URL('../gallery/studio.ts',import.meta.url),'utf8');
const hash=a=>createHash('sha256').update(new Uint8Array(a.buffer,a.byteOffset,a.byteLength)).digest('hex');
const source=p=>p.sequence.cues[0].source;
const labels={travel:'돌진 이동 시간 (초)',distance:'돌진 이동 거리 (픽셀)',duration:'표시 시간 (초)'};
async function inspector(initial){
  class Element {children=[];value='';style={};append(...v){this.children.push(...v);}replaceChildren(){this.children=[];}checkValidity(){return !this.badInput&&(this.value===''||(Number.isFinite(Number(this.value))&&Number(this.value)>=Number(this.min)&&Number(this.value)<=Number(this.max)));}reportValidity(){this.reported=true;}}
  const container=new Element(),inputs=new Map(),storage=new Map(),buttons=new Map(),errors=[],pending=[];
  const context={...controls,createProject,serializeProject,cloneJSON,createProjectRuntime,history:new EditHistory(initial),project:initial,
    runtime:await createProjectRuntime(initial),loadGeneration:0,clock:{time:0,seek(v){this.time=v;}},native:{},onionCanvas:{},shiftedCanvas:{},
    ImageData:class{},rgbaImage:null,dirty:false,lastFrame:0,latest:null,renderError:'',gpu:null,
    document:{createElement:()=>new Element()},$:()=>container,text:(tag,value)=>({tag,value}),
    labelControl:(parent,label,input)=>{if(!inputs.has(label))inputs.set(label,input);parent.append(input);},numberControl:()=>new Element(),
    choice:()=>({options:[{},{},{}]}),button:id=>{if(!buttons.has(id))buttons.set(id,{});return buttons.get(id);},
    status:(message,isError)=>{if(isError)errors.push(message);},setupRenderer:async()=>{},
    localStorage:{setItem:(k,v)=>storage.set(k,v)},
    attempt:fn=>{try{pending.push(Promise.resolve(fn()).catch(e=>errors.push(String(e))));}catch(e){errors.push(String(e));}}};
  context.renderControls=()=>{inputs.clear();context.run();};
  vm.createContext(context);
  const parts=[studio.slice(studio.indexOf('async function setProject('),studio.indexOf('async function setupRenderer(')),
    studio.slice(studio.indexOf('function renderSequence(){'),studio.indexOf('function renderPath(){')),
    studio.match(/button\('undo'\).onclick=.*;/)[0],studio.match(/button\('redo'\).onclick=.*;/)[0], 'globalThis.run=renderSequence;'];
  vm.runInContext(transformSync(parts.join('\n'),{loader:'ts',format:'iife'}).code,context);
  context.renderControls();
  return {context,inputs,storage,errors,buttons,async flush(){await Promise.all(pending.splice(0));},async edit(key,value,badInput=false){const input=inputs.get(labels[key]);assert(input,`${key} exposed`);input.value=value;input.badInput=badInput;input.onchange();await this.flush();return input;},dispose(){context.runtime.dispose();}};
}

test('planner-backed adapter accepts dash bounds, removes overrides and preserves unrelated data',()=>{
  for(const material of ['fire','energy'])for(const response of ['dissipate','burst']){
    const s={kind:'generation',intent:{material,action:'dash',response,seed:61},renderOptions:{composition:'body'}};
    assert(controls.supportsDashMotionControls(s));
    for(const [key,valid,invalid] of [['travel',[.25,.74,3],[-1,0,.249,3.001,NaN,Infinity,'1',null]],['distance',[24,128,160],[0,23.9,160.1,NaN,Infinity,'24',null]]]){
      for(const value of valid){const changed=controls.withDashMotionNumber(s,key,value);assert.equal(changed.intent[key],value);assert.deepEqual(changed.renderOptions,s.renderOptions);assert.deepEqual(controls.withDashMotionNumber(changed,key,undefined),s);assert(!Object.hasOwn(s.intent,key));}
      for(const value of invalid)assert.throws(()=>controls.withDashMotionNumber(s,key,value));
    }
    assert.throws(()=>controls.withDashMotionNumber(s,'seed',3));
  }
  for(const [material,action] of [['fire','plume'],['energy','burst'],['water','pour'],['ice','shatter'],['lightning','strike']]){
    const s={kind:'generation',intent:{material,action}};assert.equal(controls.supportsDashMotionControls(s),false);assert.throws(()=>controls.withDashMotionNumber(s,'travel',.25));
  }
});

test('actual inspector/setProject handlers preserve source, trims, autosave and undo/redo; reject malformed input',async()=>{
  for(const material of ['fire','energy']){
    const p=controls.createStudioFireGeneration('dash');source(p).intent.material=material;
    if(material==='fire'){p.sequence.cues[0].source=controls.withFireSparkChoice(source(p),'scintillation');source(p).renderOptions.fireSparkCount=77;source(p).renderOptions.fireSparkLight=.3;}
    p.seed=17;p.sequence.cues[0].options.palette=['#27101a','#a43a21','#ffd177'];delete source(p).intent.travel;delete source(p).intent.distance;
    p.seconds=2;p.sequence.duration=1.9;Object.assign(p.sequence.cues[0],{at:.1,duration:.6,fadeIn:.03,fadeOut:.04,x:7,y:9,seed:61,flip:true});
    const initial=serializeProject(p),h=await inspector(p);
    try{
      assert.equal(h.inputs.get(labels.travel).value,'');assert.equal(h.inputs.get(labels.distance).value,'');
      for(const [key,value,bad] of [['travel','oops',true],['travel','',true],['travel','0',false],['travel','3.01',false],['distance','23',false],['distance','161',false]]){
        const input=await h.edit(key,value,bad);assert(input.reported);assert.equal(serializeProject(h.context.project),initial);
      }
      // Reset invalid test DOM state, then execute actual handler and actual runtime rebuilding.
      h.context.renderControls();await h.edit('travel','.25');await h.edit('distance','160');
      const expected=parseProject(initial);source(expected).intent.travel=.25;source(expected).intent.distance=160;
      assert.equal(serializeProject(h.context.project),serializeProject(expected));
      const saved=h.storage.get('poku-studio-autosave');assert.equal(saved,serializeProject(expected));assert.equal(serializeProject(parseProject(saved)),saved);
      h.buttons.get('undo').onclick();await h.flush();assert(!Object.hasOwn(source(h.context.project).intent,'distance'));
      h.buttons.get('redo').onclick();await h.flush();assert.equal(serializeProject(h.context.project),saved);
      await h.edit('travel','');await h.edit('distance','');assert.equal(serializeProject(h.context.project),initial);
      assert.equal(h.errors.length,0);
      const reopened=await inspector(parseProject(saved));try{assert.equal(reopened.inputs.get(labels.travel).value,'0.25');assert.equal(reopened.inputs.get(labels.distance).value,'160');}finally{reopened.dispose();}
    }finally{h.dispose();}
  }
});

test('unsupported inspector actions omit motion fields',async()=>{
  for(const [material,action] of [['fire','plume'],['energy','burst'],['ice','shatter'],['water','pour'],['lightning','strike']]){
    const p=controls.createStudioFireGeneration('dash');p.sequence.cues[0].source={kind:'generation',intent:{material,action}};
    const h=await inspector(p);try{assert(!h.inputs.has(labels.travel));assert(!h.inputs.has(labels.distance));}finally{h.dispose();}
  }
});

test('actual handler preserves valid event-anchor crop when an edit would invalidate arrival',async()=>{
  const p=controls.createStudioFireGeneration('dash');source(p).intent.travel=.25;p.sequence.cues[0].duration=.6;
  p.sequence.cues.push({...cloneJSON(p.sequence.cues[0]),id:'arrival-response',source:{kind:'generation',intent:{material:'energy',action:'burst'}},eventAnchor:{cue:'fire',event:'arrival',targetEvent:'release'}});
  delete p.sequence.cues[1].duration;
  const h=await inspector(p),before=serializeProject(h.context.project),beforeHistory=serializeProject(h.context.history.value);
  try{await h.edit('travel','3');assert.equal(h.errors.length,1);assert.match(h.errors[0],/event|anchor|window|crop/i);assert.equal(serializeProject(h.context.project),before);assert.equal(serializeProject(h.context.history.value),beforeHistory);assert.equal(h.storage.size,0);}finally{h.dispose();}
});

test('real runtime renders changed motion; omission reset is byte-exact; display trim never accelerates',async()=>{
  const pngSource=readFileSync(new URL('../gallery/png.ts',import.meta.url),'utf8');
  const {encodeRGBAPNG}=await import('data:text/javascript;base64,'+Buffer.from(transformSync(pngSource,{loader:'ts',format:'esm'}).code).toString('base64'));
  const out=process.env.POKU_MOTION_EVIDENCE;
  if(out)mkdirSync(out,{recursive:true});
  const report={provenance:'HEAD 60f3e0c source, actual Studio inspector handlers -> createProjectRuntime -> createFx -> existing gallery/png.ts encoder. CPU samples only, no image generation or artistic approval.',cases:[]};
  for(const material of ['fire','energy']){
    const p=controls.createStudioFireGeneration('dash');source(p).intent.material=material;delete source(p).intent.travel;delete source(p).intent.distance;p.bg='none';
    const h=await inspector(p),beforeJSON=serializeProject(h.context.project),baseHash=hash(h.context.runtime.render(.45,13,false).rgba);
    try{
      assert(Math.abs(h.context.runtime.duration-2.07)<1e-10);
      await h.edit('duration','.5');assert.equal(hash(h.context.runtime.render(.45,13,false).rgba),baseHash);assert.equal(h.context.runtime.render(.55,16,false).frame.color.filter(c=>c>>>24).length,0);
      await h.edit('travel','.25');assert.equal(h.context.project.sequence.cues[0].duration,.5);assert.equal(h.context.runtime.duration,.5);
      await h.edit('duration','');assert(Math.abs(h.context.runtime.duration-1.58)<1e-10);
      await h.edit('distance','160');assert.notEqual(hash(h.context.runtime.render(.45,13,false).rgba),baseHash);
      const fastJSON=serializeProject(h.context.project),reopened=await createProjectRuntime(parseProject(fastJSON));
      try{assert.equal(hash(reopened.render(.45,13,false).rgba),hash(h.context.runtime.render(.45,13,false).rgba));}finally{reopened.dispose();}
      for(const [name,json] of [['default',beforeJSON],['travel025-distance160',fastJSON]]){
        const restored=parseProject(json),r=await createProjectRuntime(restored);try{
          const sample=r.render(.45,13,false),plan=createGenerationPlan2D(source(restored).intent),blob=await encodeRGBAPNG(r.width,r.height,sample.rgba),bytes=new Uint8Array(await blob.arrayBuffer());
          if(out){writeFileSync(`${out}/${material}-${name}.png`,bytes,{flag:'wx'});writeFileSync(`${out}/${material}-${name}.project.json`,json,{flag:'wx'});}
          report.cases.push({material,name,t:.45,duration:r.duration,arrival:plan.timing.arrival,rgbaSHA256:hash(sample.rgba),pngSHA256:hash(bytes)});
        }finally{r.dispose();}
      }
      await h.edit('travel','1.1');assert(Math.abs(h.context.runtime.duration-2.43)<1e-10);
      await h.edit('travel','');await h.edit('distance','');assert.equal(serializeProject(h.context.project),beforeJSON);assert.equal(hash(h.context.runtime.render(.45,13,false).rgba),baseHash);
      assert.equal(h.errors.length,0);
    }finally{h.dispose();}
  }
  if(out)writeFileSync(`${out}/runtime-results.json`,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
});
