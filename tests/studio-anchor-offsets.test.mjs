// Focused CPU/VM tests of actual Studio handlers. No browser or aesthetic certification.
// These assertions intentionally fail against the pre-patch absolute-only inspector.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {transformSync} from 'esbuild';
import * as controls from '../build/authoring/generation-controls.js';
import {createProject,parseProject,serializeProject,cloneJSON} from '../build/authoring/project.js';
import {createSequenceSpec} from '../build/authoring/sequence.js';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {EditHistory} from '../build/authoring/history.js';
const studio=readFileSync(process.env.POKU_STUDIO_SOURCE??new URL('../gallery/studio.ts',import.meta.url),'utf8');
const labels={at:'이벤트 시간 오프셋 (초)',x:'이벤트 X 오프셋 (픽셀)',y:'이벤트 Y 오프셋 (픽셀)'};
const hash=a=>createHash('sha256').update(a).digest('hex');
const close=(a,b)=>assert(Math.abs(a-b)<1e-12,`${a} != ${b}`);
function fixture(offset=-.04){
  return createProject({id:'test/studio-anchor-offsets',kind:'sequence',seed:17,bg:'none',actor:false,target:false,
    sequence:createSequenceSpec({cues:[
      {id:'pulse',source:{kind:'generation',intent:{material:'energy',action:'dash',travel:.74,distance:88}},at:.2,x:11,y:-3,angle:-.2,flip:true},
      {id:'response',source:{kind:'generation',intent:{material:'fire',action:'burst'}},
       eventAnchor:{cue:'pulse',event:'arrival',targetEvent:'release'},at:offset,x:2,y:-4,angle:.3,flip:true,
       fadeIn:.02,fadeOut:.03,seed:61,options:{layers:{sparks:false}}},
    ]})});
}
async function inspector(initial){
  class Element {
    children=[];listeners={};value='';style={};
    append(...v){this.children.push(...v);} replaceChildren(){this.children=[];}
    addEventListener(name,fn){this.listeners[name]=fn;}
    checkValidity(){return !this.badInput&&(this.value===''||(Number.isFinite(Number(this.value))&&Number(this.value)>=Number(this.min)&&Number(this.value)<=Number(this.max)));}
    reportValidity(){this.reported=true;}
  }
  const inputs=new Map(),storage=new Map(),buttons=new Map(),errors=[],pending=[],container=new Element();
  const c={...controls,createProject,serializeProject,cloneJSON,createProjectRuntime,history:new EditHistory(initial),project:initial,
    runtime:await createProjectRuntime(initial),loadGeneration:0,clock:{time:0,seek(v){this.time=v;}},native:{},onionCanvas:{},shiftedCanvas:{},
    ImageData:class{},rgbaImage:null,dirty:false,lastFrame:0,latest:null,renderError:'',gpu:null,
    document:{createElement:()=>new Element()},$:()=>container,text:(tag,value)=>({tag,value}),
    labelControl:(parent,label,input)=>{if(!inputs.has(label))inputs.set(label,[]);inputs.get(label).push(input);parent.append(input);},
    choice:()=>({options:[{},{},{}]}),button:id=>{if(!buttons.has(id))buttons.set(id,{});return buttons.get(id);},
    status:(message,error)=>{if(error)errors.push(message);},setupRenderer:async()=>{},
    localStorage:{setItem:(key,value)=>storage.set(key,value)},
    attempt:fn=>{try{pending.push(Promise.resolve(fn()).catch(e=>errors.push(String(e))));}catch(e){errors.push(String(e));}}};
  c.renderControls=()=>{inputs.clear();c.run();};vm.createContext(c);
  const n=studio.indexOf('function numberControl(');
  const parts=[studio.slice(n,studio.indexOf('\n',n)),
    studio.slice(studio.indexOf('async function setProject('),studio.indexOf('async function setupRenderer(')),
    studio.slice(studio.indexOf('function renderSequence(){'),studio.indexOf('function renderPath(){')),
    studio.match(/button\('undo'\).onclick=.*;/)[0],studio.match(/button\('redo'\).onclick=.*;/)[0],
    'globalThis.run=renderSequence;'];
  vm.runInContext(transformSync(parts.join('\n'),{loader:'ts',format:'iife'}).code,c);c.renderControls();
  return {c,inputs,storage,errors,buttons,
    field(label,index=0){const f=inputs.get(label)?.[index];assert(f,`${label} exposed`);return f;},
    async flush(){while(pending.length)await Promise.all(pending.splice(0));},
    async edit(label,value,index=0){const f=this.field(label,index);f.value=value;(f.listeners.change??f.onchange)();await this.flush();return f;},
    dispose(){c.runtime.dispose();}};
}

test('actual inspector distinguishes anchored signed offsets from ordinary placement and accepts default zero',async()=>{
  const h=await inspector(fixture(0));
  try{
    assert.equal(h.field(labels.at).min,'-3600');assert.equal(h.field(labels.at).max,'3600');assert.equal(h.field(labels.at).value,'0');
    assert.equal(h.field(labels.x).value,'2');assert.equal(h.field(labels.y).value,'-4');
    assert.equal(h.field('시작 (초)').min,'0');assert.equal(h.field('X (픽셀)').value,'11');assert.equal(h.field('Y (픽셀)').value,'-3');
    const before=serializeProject(h.c.project),invalid=await h.edit('시작 (초)','-.01');assert(invalid.reported);assert.equal(serializeProject(h.c.project),before);
    await h.edit(labels.at,'0');assert.equal(h.errors.length,0);close(h.c.runtime.events.find(e=>e.id==='response/release').at,.2+.28+.74);
  }finally{h.dispose();}
});

test('negative offset edits drive actual runtime events, save/reopen and undo/redo while preserving unrelated source data',async()=>{
  const initial=fixture(),h=await inspector(initial),before=serializeProject(initial);
  try{
    close(h.c.runtime.events.find(e=>e.id==='response/release').at,.2+.28+.74-.04);
    const accepted=await h.edit(labels.at,'-.03');assert(!accepted.reported);assert.equal(h.errors.length,0);
    const expected=parseProject(before);expected.sequence.cues[1].at=-.03;
    assert.equal(serializeProject(h.c.project),serializeProject(expected));
    close(h.c.runtime.events.find(e=>e.id==='response/release').at,.2+.28+.74-.03);
    const saved=h.storage.get('poku-studio-autosave');assert.equal(saved,serializeProject(expected));
    const reopened=await inspector(parseProject(saved));try{
      assert.equal(reopened.field(labels.at).value,'-0.03');close(reopened.c.runtime.events.find(e=>e.id==='response/release').at,1.19);
      assert.equal(hash(reopened.c.runtime.render(1.3,39,false).rgba),hash(h.c.runtime.render(1.3,39,false).rgba));
    }finally{reopened.dispose();}
    h.buttons.get('undo').onclick();await h.flush();assert.equal(serializeProject(h.c.project),before);
    h.buttons.get('redo').onclick();await h.flush();assert.equal(serializeProject(h.c.project),saved);
    await h.edit(labels.x,'-7');await h.edit(labels.y,'8');expected.sequence.cues[1].x=-7;expected.sequence.cues[1].y=8;
    assert.equal(serializeProject(h.c.project),serializeProject(expected));assert.equal(h.storage.get('poku-studio-autosave'),serializeProject(expected));
    assert.equal(h.errors.length,0);
  }finally{h.dispose();}
});

test('a signed offset resolving before zero is rejected atomically without changing history, autosave or rendered output',async()=>{
  const h=await inspector(fixture());
  try{
    await h.edit(labels.at,'-.03');assert.equal(h.errors.length,0);
    const before=serializeProject(h.c.project),history=serializeProject(h.c.history.value),saved=h.storage.get('poku-studio-autosave'),runtime=h.c.runtime;
    const canUndo=h.c.history.canUndo,canRedo=h.c.history.canRedo,rgba=hash(runtime.render(1.3,39,false).rgba);
    // Independent start arithmetic: .2 + (.28+.74) - .22 - 1.1 = -.1.
    const field=await h.edit(labels.at,'-1.1');assert(!field.reported,'HTML range must accept this signed offset; runtime rejects resolved start');
    assert.equal(h.errors.length,1);assert.match(h.errors[0],/before zero/);
    assert.equal(serializeProject(h.c.project),before);assert.equal(serializeProject(h.c.history.value),history);
    assert.equal(h.c.history.canUndo,canUndo);assert.equal(h.c.history.canRedo,canRedo);assert.equal(h.storage.get('poku-studio-autosave'),saved);
    assert.equal(h.c.runtime,runtime);assert.equal(hash(runtime.render(1.3,39,false).rgba),rgba);
  }finally{h.dispose();}
});
