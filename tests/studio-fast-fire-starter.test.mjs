// CPU project/lifecycle/export contracts. Native still review and playback are separate.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,unlinkSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as controls from '../build/authoring/generation-controls.js';
import {createProject,parseProject,serializeProject} from '../build/authoring/project.js';
import {createSequenceSpec,sequenceCueSeed} from '../build/authoring/sequence.js';
import {createGenerationPlan2D,createGeneratedEffect2D} from '../build/authoring/generation.js';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {EditHistory} from '../build/authoring/history.js';
import {renderProject} from '../build-tools/tools/lib/project-render.mjs';
import {validateIntentBrief} from '../tools/lib/effect-intent.mjs';
const source=p=>p.sequence.cues[0].source;
const hash=v=>createHash('sha256').update(new Uint8Array(v.buffer,v.byteOffset,v.byteLength)).digest('hex');

test('fast dash-burst is explicit, stores the bounded recipe, and preserves both original starters',()=>{
  const p=controls.createStudioFastFireDashBurst(),s=source(p),plan=createGenerationPlan2D(s.intent);
  assert.equal(p.id,'sequences/fire-fast-dash-burst');assert.equal(p.name,'빠른 화염 돌진 · 폭발');
  assert.equal(p.kind,'sequence');assert.equal(p.seed,1);assert.equal(p.fps,30);assert.equal(p.bg,'dark');
  assert.equal(p.actor,false);assert.equal(p.target,false);assert.equal(p.sequence.cues.length,1);
  assert.equal(p.sequence.cues[0].seed,undefined);assert.equal(p.seconds,undefined);assert.equal(p.sequence.duration,undefined);assert.equal(p.sequence.cues[0].duration,undefined);
  assert.deepEqual({...s.intent},{material:'fire',action:'dash',response:'burst',distance:140,travel:.25});
  assert.deepEqual(s.renderOptions,{composition:'body',fireSparks:'short-exposure',fireSparkFinish:'scintillation'});
  assert.deepEqual(plan.size,[384,256]);assert.deepEqual(plan.timing,{release:.28,arrival:.53,sourceEmissionEnd:.53,emissionEnd:.61,end:1.78});
  const html=readFileSync(new URL('../gallery/studio.html',import.meta.url),'utf8'),ui=readFileSync(new URL('../gallery/studio.ts',import.meta.url),'utf8');
  assert.match(html,/id="new-fire-fast-dash-burst"[^>]*>\+ 빠른 화염 돌진 · 폭발/);
  assert.match(ui,/button\('new-fire-fast-dash-burst'\).onclick=.*setProject\(createStudioFastFireDashBurst\(\),'commit',false\)/);
  assert.match(ui,/let project=recipeProject\('thrown-blade'\)/);
  for(const action of ['plume','dash']){
    const expected=createProject({id:`sequences/fire-${action}`,name:action==='plume'?'화염 분출':'화염 돌진 · 소멸',kind:'sequence',seed:1,fps:30,bg:'dark',actor:false,target:false,
      sequence:createSequenceSpec({cues:[{id:'fire',source:{kind:'generation',intent:{material:'fire',action,response:'dissipate'},renderOptions:{composition:'material-volumes'}}}]})});
    assert.equal(serializeProject(controls.createStudioFireGeneration(action)),serializeProject(expected));
  }
  source(p).intent.distance=24;source(p).renderOptions.fireSparkCount=0;
  assert.equal(source(controls.createStudioFastFireDashBurst()).intent.distance,140);
  assert(!Object.hasOwn(source(controls.createStudioFastFireDashBurst()).renderOptions,'fireSparkCount'));
});

test('public spark controls return the new starter to legacy with undo/redo and exact save/load',()=>{
  const p=controls.createStudioFastFireDashBurst(),initial=serializeProject(p),history=new EditHistory(p);
  for(const choice of ['short-exposure','scintillation','legacy']){
    const next=parseProject(initial);next.sequence.cues[0].source=controls.withFireSparkChoice(source(next),choice);history.commit(next);
    assert.equal(controls.fireSparkChoice(source(next)),choice);assert.deepEqual(source(next).intent,source(p).intent);
    assert.equal(serializeProject(parseProject(serializeProject(next))),serializeProject(next));
  }
  assert.deepEqual(source(history.value).renderOptions,{composition:'body'});
  assert.equal(controls.fireSparkChoice(source(history.undo())),'scintillation');
  assert.equal(controls.fireSparkChoice(source(history.redo())),'legacy');
  history.undo();history.undo();assert.equal(serializeProject(history.undo()),initial);
  let s=controls.withFireSparkNumber(source(p),'fireSparkCount',0);s=controls.withFireSparkNumber(s,'fireSparkLight',0);
  assert.deepEqual(controls.withFireSparkChoice(s,'legacy').renderOptions,{composition:'body'});
});

test('new starter uses unchanged 410 births and 24 lights for both project-derived and explicit cue seeds',async()=>{
  const file=new URL(`../build/authoring/fast-starter-inspect-${process.pid}.js`,import.meta.url);
  const src=readFileSync(new URL('../build/authoring/generation.js',import.meta.url),'utf8');
  assert(src.includes('const thermal ='));
  writeFileSync(file,src.replace('const thermal =','Object.assign(inspection,{sparkField,burstSparkField}); const thermal =')+'\nexport const inspection={};\n');
  try{
    const mod=await import(file.href);
    for(const seed of [sequenceCueSeed(1,'fire'),sequenceCueSeed(61,'fire'),17,61]){
      const s=source(controls.createStudioFastFireDashBurst()),plan=createGenerationPlan2D({...s.intent,seed}),m=mod.createGeneratedEffect2D(plan,s.renderOptions);m.create(m.meta.options);
      const {sparkField:a,burstSparkField:b}=mod.inspection;
      assert.equal(a.count,240);assert.equal(b.count,170);assert.equal(a.births.filter(x=>x.lit).length+b.births.filter(x=>x.lit).length,24);
      assert.equal(b.sample(plan.timing.arrival-1e-6).length,0);
    }
  }finally{unlinkSync(file);}
});

test('actual starter runtime, restored project, direct factory and full native export agree at 30 fps',async()=>{
  for(const [projectSeed,cueSeed] of [[1,undefined],[61,undefined],[1,17],[1,61]]){
    const p=controls.createStudioFastFireDashBurst();p.seed=projectSeed;if(cueSeed!==undefined)p.sequence.cues[0].seed=cueSeed;
    const saved=serializeProject(p),restored=parseProject(saved),s=source(restored),seed=cueSeed??sequenceCueSeed(projectSeed,'fire');
    const r=await createProjectRuntime(p),reopened=await createProjectRuntime(restored);
    const mod=createGeneratedEffect2D(createGenerationPlan2D({...s.intent,seed}),s.renderOptions);
    const direct=await createProjectRuntime(createProject({id:'test/direct',seed,fps:30,bg:p.bg,actor:false,target:false}),mod);
    const exported=await renderProject(restored);let i=0;
    try{
      assert.equal(r.width,384);assert.equal(r.height,256);assert.equal(r.duration,1.78);assert.equal(r.frameCount,54);
      assert.equal(exported.sequence.fps,30);assert.equal(exported.sequence.n,r.frameCount);
      for(const f of exported.sequence.frames){
        const t=i/30,a=r.render(t,i,false),b=reopened.render(t,i,false),c=direct.render(t,i,false);
        assert.equal(hash(a.rgba),hash(b.rgba),`reopen ${projectSeed}/${cueSeed}/${i}`);
        assert.equal(hash(a.rgba),hash(c.rgba),`factory ${projectSeed}/${cueSeed}/${i}`);
        assert.equal(hash(a.rgba),hash(f.color),`export ${projectSeed}/${cueSeed}/${i}`);i++;
      }
      assert.equal(i,54);
      for(const i of [25,12,18,0,53])assert.equal(hash(r.render(i/30,i,false).rgba),hash(reopened.render(i/30,i,false).rgba));
      assert.equal(serializeProject(restored),saved);
    }finally{r.dispose();reopened.dispose();direct.dispose();}
  }
});

test('starter intent reference is valid and describes its actual untrimmed plan without approval',()=>{
  const p=controls.createStudioFastFireDashBurst(),brief=validateIntentBrief(JSON.parse(readFileSync(new URL('../'+p.intentRef,import.meta.url),'utf8')),p.id);
  const plan=createGenerationPlan2D(source(p).intent);
  assert.equal(brief.timeline.durationSeconds,plan.timing.end);assert.equal(brief.timeline.loop,false);
  assert.equal(brief.timeline.phases.find(x=>x.name==='response').from,plan.timing.arrival);
  assert(!Object.hasOwn(brief,'userApproval'));
});
