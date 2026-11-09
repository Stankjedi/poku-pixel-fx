// CPU/data and bounded fake-DOM contracts, not browser interaction or aesthetic review.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { transformSync } from 'esbuild';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
const digest=value=>createHash('sha256').update(new Uint8Array(value.buffer,value.byteOffset,value.byteLength)).digest('hex');
const equalPixels=(a,b,label)=>assert.equal(digest(a),digest(b),label);
import * as controls from '../build/authoring/generation-controls.js';
import { createProject, parseProject, serializeProject } from '../build/authoring/project.js';
import { EditHistory } from '../build/authoring/history.js';
import { createProjectRuntime } from '../build/authoring/runtime.js';
import { createGenerationPlan2D, createGeneratedEffect2D } from '../build/authoring/generation.js';
import { generationRenderOptions2D } from '../build-tools/tools/lib/generation-style.mjs';
import { renderProject } from '../build-tools/tools/lib/project-render.mjs';
import { renderSequence } from '../build-tools/tools/lib/fxlib.mjs';
const studio=readFileSync(new URL('../gallery/studio.ts',import.meta.url),'utf8');
const pngSource=readFileSync(new URL('../gallery/png.ts',import.meta.url),'utf8');
const {encodeRGBAPNG}=await import('data:text/javascript;base64,'+Buffer.from(transformSync(pngSource,{loader:'ts',format:'esm'}).code).toString('base64'));

test('actual sequence inspector handles generation cues and binds spark choices without character access',()=>{
  class Element { children=[]; value=''; append(...children){this.children.push(...children);} replaceChildren(){this.children=[];} checkValidity(){return true;} }
  const container=new Element(),inputs=new Map(),choices=new Map();
  let project=controls.createStudioFireGeneration('plume');
  const context={...controls,document:{createElement:()=>new Element()},$:()=>container,text:(tag,value)=>({tag,value}),
    labelControl:(parent,label,input)=>{inputs.set(label,input);parent.append(input);},
    numberControl:()=>new Element(),choice:(parent,label,values,value,change)=>{const element={options:values.map(()=>({})),change,value};choices.set(label,element);return element;},
    attempt:fn=>fn(),mutate:fn=>{const next=JSON.parse(serializeProject(project));fn(next);project=createProject(next);context.project=project;},project};
  vm.createContext(context);
  const source=studio.slice(studio.indexOf('function renderSequence(){'),studio.indexOf('function renderPath(){'));
  vm.runInContext(transformSync(source+'\nglobalThis.run=renderSequence;',{loader:'ts',format:'iife'}).code,context);
  context.run();assert.equal(choices.get('불티').value,'legacy');
  choices.get('불티').change('scintillation');context.run();
  assert.equal(project.sequence.cues[0].source.renderOptions.fireSparkFinish,'scintillation');
  inputs.get('불티 개수').value='0';inputs.get('불티 개수').onchange();context.run();
  assert.equal(project.sequence.cues[0].source.renderOptions.fireSparkCount,0);
  inputs.get('불티 개수').value='';inputs.get('불티 개수').onchange();
  assert(!Object.hasOwn(project.sequence.cues[0].source.renderOptions,'fireSparkCount'));
  inputs.get('불티 발광').value='0.333';inputs.get('불티 발광').onchange();assert.equal(project.sequence.cues[0].source.renderOptions.fireSparkLight,.333);
  project.sequence.cues[0].source={kind:'generation',intent:{material:'fire',action:'burst'}};context.project=project;choices.clear();context.run();
  assert.equal(choices.get('불티').value,'legacy');choices.get('불티').change('scintillation');context.run();
  assert.equal(inputs.get('불티 개수').placeholder,'기본 170');assert.equal(project.sequence.cues[0].source.renderOptions.fireSparkFinish,'scintillation');
  project.sequence.cues[0].source={kind:'generation',intent:{material:'energy',action:'plume'}};context.project=project;choices.clear();context.run();assert.equal(choices.has('불티'),false);
  assert.match(studio,/button\(`new-fire-\$\{action\}`\).onclick=.*setProject\(createStudioFireGeneration\(action\)/);
  for(const action of ['plume','dash'])assert.match(readFileSync(new URL('../gallery/studio.html',import.meta.url),'utf8'),new RegExp(`id="new-fire-${action}"`));
});

test('selection preserves composition and meaning, distinguishes zero/omission, and round trips undo',()=>{
  for(const action of ['plume','dash']){const starter=controls.createStudioFireGeneration(action).sequence.cues[0].source;assert.deepEqual(starter.renderOptions,generationRenderOptions2D(createGenerationPlan2D(starter.intent)));}
  const initial=controls.createStudioFireGeneration('dash');initial.seed=61;initial.sequence.cues[0].seed=17;
  const bytes=serializeProject(initial),history=new EditHistory(parseProject(bytes));
  let source=initial.sequence.cues[0].source;
  source=controls.withFireSparkChoice(source,'scintillation');
  source=controls.withFireSparkNumber(source,'fireSparkCount',0);source=controls.withFireSparkNumber(source,'fireSparkLight',0);
  source=controls.withFireSparkChoice(source,'short-exposure');assert.equal(source.renderOptions.fireSparkCount,0);assert.equal(source.renderOptions.fireSparkLight,0);assert(!('fireSparkFinish' in source.renderOptions));
  const next=parseProject(bytes);next.sequence.cues[0].source=source;history.commit(next);
  assert.equal(serializeProject(parseProject(serializeProject(next))),serializeProject(next));
  assert.equal(serializeProject(history.undo()),bytes);assert.equal(history.redo().sequence.cues[0].seed,17);
  assert.deepEqual(controls.withFireSparkChoice(source,'legacy'),initial.sequence.cues[0].source);
  const omitted={kind:'generation',intent:{material:'fire',action:'plume'}};
  assert.deepEqual(controls.withFireSparkChoice(omitted,'legacy'),omitted);
  const explicitEmpty={...omitted,renderOptions:{}};assert.deepEqual(controls.withFireSparkChoice(explicitEmpty,'legacy'),explicitEmpty);
  for(const [material,action,response] of [['energy','plume','dissipate'],['ice','shatter','dissipate']]){
    const other={kind:'generation',intent:{material,action,response}};assert.equal(controls.supportsFireSparkControls(other),false);assert.throws(()=>controls.withFireSparkChoice(other,'short-exposure'));
  }
  const imported={...source,intent:{...source.intent,distance:160,travel:1.1},renderOptions:{...source.renderOptions,composition:'body'}};
  const changed=controls.withFireSparkChoice(imported,'scintillation');assert.deepEqual(changed.intent,imported.intent);assert.equal(changed.renderOptions.composition,'body');
  assert.throws(()=>controls.withFireSparkChoice(source,'invalid'));
  for(const value of [-1,1.5,721,NaN,Infinity])assert.throws(()=>controls.withFireSparkNumber(source,'fireSparkCount',value));
  for(const value of [-1,2.1,NaN,Infinity])assert.throws(()=>controls.withFireSparkNumber(source,'fireSparkLight',value));
  assert.throws(()=>controls.withFireSparkNumber(omitted,'fireSparkLight',0));
});

test('both Studio starters save and export exact direct-factory CPU native PNGs for all three choices',async()=>{
  for(const action of ['plume','dash'])for(const choice of ['legacy','short-exposure','scintillation']){
    const project=controls.createStudioFireGeneration(action);project.bg='none';project.fps=10;project.seed=61;project.sequence.cues[0].seed=61;
    project.sequence.cues[0].source=controls.withFireSparkChoice(project.sequence.cues[0].source,choice);
    const restored=parseProject(serializeProject(project)),runtime=await createProjectRuntime(restored),saved=await createProjectRuntime(parseProject(serializeProject(restored)));
    const source=restored.sequence.cues[0].source,plan=createGenerationPlan2D({...source.intent,seed:61}),mod=createGeneratedEffect2D(plan,source.renderOptions);
    const direct=renderSequence({id:project.id,file:'',mod,meta:mod.meta},{fps:10,seed:61,bg:'none',hdr:true,edgeFade:0});
    const exported=await renderProject(restored),directFrames=[...direct.frames],exportFrames=[...exported.sequence.frames];
    try{
      assert.equal(runtime.width,direct.w);assert.equal(runtime.height,direct.h);assert.equal(exportFrames.length,directFrames.length);
      for(const i of [3,7,10,Math.min(16,directFrames.length-1)]){
        const preview=runtime.render(i/10,i,false),reopened=saved.render(i/10,i,false);
        equalPixels(preview.rgba,reopened.rgba);equalPixels(preview.rgba,exportFrames[i].color,`${action}/${choice}/export ${i}`);

        // Same finishing settings through a direct-factory runtime, bypassing generation sequence resolution.
        const factoryRuntime=await createProjectRuntime(createProject({id:'test/direct',seed:61,fps:10,bg:'none',actor:false,target:false}),mod);
        try{const directRGBA=factoryRuntime.render(i/10,i,false).rgba;
          equalPixels(preview.rgba,directRGBA);
          const a=await encodeRGBAPNG(runtime.width,runtime.height,preview.rgba),b=await encodeRGBAPNG(factoryRuntime.width,factoryRuntime.height,directRGBA);
          assert.deepEqual(new Uint8Array(await a.arrayBuffer()),new Uint8Array(await b.arrayBuffer()));
        }finally{factoryRuntime.dispose();}
      }
    }finally{runtime.dispose();saved.dispose();}
  }
});
