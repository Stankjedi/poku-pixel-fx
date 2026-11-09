import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createGeneratedEffect2D,createGenerationPlan2D} from '../build/authoring/generation.js';
import {createFrame,enableHDRLight,Painter} from '../build/core/index.js';
import {prepareGenerationPreview,parseGenerationPreviewArgs} from '../build-tools/tools/lib/generation-preview.mjs';
import {supportsFireSparkControls,withFireSparkChoice,withFireSparkNumber} from '../build/authoring/generation-controls.js';
import {serializeProject,parseProject} from '../build/authoring/project.js';
const style={fireSparks:'short-exposure',fireSparkFinish:'scintillation'};
const intent={material:'fire',action:'dash',response:'burst',distance:140,travel:.25};
const file=new URL(`../build/authoring/dash-burst-inspect-${process.pid}.js`,import.meta.url);
const src=readFileSync(new URL('../build/authoring/generation.js',import.meta.url),'utf8');
writeFileSync(file,src.replace('const thermal =','Object.assign(inspection,{sparkField,sparks,burstSparkField,burst}); const thermal =')+'\nexport const inspection={};\n');
const instrumented=await import(file.href);unlinkSync(file);
function draw(m,t,layers={}){const f=enableHDRLight(createFrame(...m.meta.size)),p=new Painter(f).place(...m.meta.origin),i=m.create({...m.meta.options,layers});i.drawBack(p,t);i.draw(p,t);return f;}
test('combined total budget, phase positions, detached deterministic births, and shared lights',()=>{
 for(const seed of[17,61])for(const count of[undefined,0,1,2,3,24,350,410,720]){
  const plan=createGenerationPlan2D({...intent,seed}),o={...style,...(count===undefined?{}:{fireSparkCount:count})};
  const m=instrumented.createGeneratedEffect2D(plan,o);m.create(m.meta.options);
  const{sparkField:f,burstSparkField:b,sparks,burst}=instrumented.inspection;
  assert.equal(sparks,undefined);assert.equal(burst,undefined);
  const total=count??410;assert.equal(f.count+b.count,total);assert.equal(f.count,Math.round(total*240/410));
  assert.equal(f.births.filter(x=>x.lit).length+b.births.filter(x=>x.lit).length,Math.min(total,24));
  assert(f.births.every(x=>x.born>=plan.timing.release&&x.born<plan.timing.arrival));
  assert(b.births.every(x=>x.born>=plan.timing.arrival&&x.born<plan.timing.emissionEnd));
  assert.equal(b.sample(plan.timing.arrival-1e-6).length,0);
  assert(b.births.every(x=>Math.hypot(x.x-plan.to[0],x.y-plan.to[1])<40));
  const snapshot=structuredClone([f.births,b.births]);f.sample(1.1);b.sample(.6);f.sample(.3);
  assert.deepEqual([f.births,b.births],snapshot);
  m.create(m.meta.options);assert.deepEqual([instrumented.inspection.sparkField.births,instrumented.inspection.burstSparkField.births],snapshot);
 }
});
test('combined hidden sparks preserve body and phases, zero suppresses both, endpoints and light off remain exact',()=>{
 for(const seed of[17,61]){const p=createGenerationPlan2D({...intent,seed}),legacy=createGeneratedEffect2D(p),short=createGeneratedEffect2D(p,style),zero=createGeneratedEffect2D(p,{...style,fireSparkCount:0});
 assert.deepEqual(legacy.meta,short.meta);assert.deepEqual(legacy.events,short.events);
 for(const t of[0,.2,.325,.525,.53,.55,.7,1.1,short.meta.duration]){
  assert.deepEqual(draw(legacy,t,{sparks:false}),draw(short,t,{sparks:false}));
  assert.deepEqual(draw(zero,t),draw(short,t,{sparks:false}));
  const dark=draw(short,t,{light:false});assert(!dark.light.some(Boolean));assert(!dark.hdrLight.some(Boolean));
  if(t===0||t===short.meta.duration)assert(!dark.color.some(Boolean));
  assert.deepEqual(draw(short,t).color,draw(createGeneratedEffect2D(p,{...style,fireSparkLight:0}),t).color);
 }
 }
});
test('actual preview options, saved source and Studio helpers preserve the combined selection and explicit zeros',()=>{
 const req=parseGenerationPreviewArgs(['--material','fire','--action','dash','--response','burst','--distance','140','--travel','.25','--seeds','17,61','--fire-sparks','short-exposure','--fire-spark-finish','scintillation','--out','/tmp/unused-dash-burst']);
 for(const c of prepareGenerationPreview(req.intent,req.seeds,req.style)){
  assert.deepEqual(c.renderOptions,style);const restored=parseProject(serializeProject(c.project));
  let source=restored.sequence.cues[0].source;assert(supportsFireSparkControls(source));
  source=withFireSparkChoice(source,'scintillation');source=withFireSparkNumber(source,'fireSparkCount',0);source=withFireSparkNumber(source,'fireSparkLight',0);
  assert.deepEqual(source.renderOptions,{...style,fireSparkCount:0,fireSparkLight:0});
  assert.equal(withFireSparkChoice(source,'legacy').renderOptions,undefined);
 }
 const p=createGenerationPlan2D(intent);for(const n of[-1,.5,721,NaN])assert.throws(()=>createGeneratedEffect2D(p,{...style,fireSparkCount:n}));
 assert.throws(()=>createGeneratedEffect2D(p,{...style,composition:'material-volumes'}));
});
