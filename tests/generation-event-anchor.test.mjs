import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createSequenceSpec, createSequenceEffect } from '../build/authoring/sequence.js';
import { createGenerationPlan2D } from '../build/authoring/generation.js';
import { createProject, parseProject, serializeProject } from '../build/authoring/project.js';
import { createProjectRuntime } from '../build/authoring/runtime.js';
import { createFx, createFrame } from '../build/core/fx.js';
import { enableHDRLight } from '../build/render/hdr.js';
const gen = (material, action, extra = {}) => ({ kind: 'generation', intent: { material, action, ...extra } });
const linked = () => createSequenceSpec({ size: [384, 256], origin: [192, 170], cues: [
  { id: 'pulse', source: gen('energy', 'dash'), at: .2, x: 11, y: -3, angle: -.2, flip: true },
  { id: 'response', source: gen('fire', 'dash', { distance: 48, travel: .4 }),
    eventAnchor: { cue: 'pulse', event: 'arrival', targetEvent: 'release' }, at: .06, x: 2, y: -4, angle: .3, flip: true },
] });
const compile = spec => createSequenceEffect(spec, () => { throw new Error('Catalog access is not expected'); });
const clone = value => structuredClone(value);
const close = (a,b) => assert(Math.abs(a-b) < 1e-10, `${a} != ${b}`);
// Independent manual arithmetic. This deliberately does not import the resolver/transform helper.
function manual(input) {
  const p = clone(input), done = new Set();
  function resolve(c) {
    if (done.has(c.id)) return;
    const a = c.eventAnchor;
    if (a) {
      const s = p.cues.find(q => q.id === a.cue); resolve(s);
      const se = createGenerationPlan2D(s.source.intent).events.find(e => e.id === a.event);
      const te = createGenerationPlan2D(c.source.intent).events.find(e => e.id === a.targetEvent);
      const xy = (cue,e) => { const x = e.payload.x * (cue.flip ? -1 : 1), y = e.payload.y, cs = Math.cos(cue.angle), sn = Math.sin(cue.angle); return [x*cs-y*sn, x*sn+y*cs]; };
      const from = xy(s,se), to = xy(c,te);
      c.at = s.at + se.at - te.at + c.at; c.x = from[0] + s.x - to[0] + c.x; c.y = from[1] + s.y - to[1] + c.y;
      delete c.eventAnchor;
    }
    done.add(c.id);
  }
  p.cues.forEach(resolve); return p;
}
function raster(mod, time, options = {}) {
  const frame = enableHDRLight(createFrame(...mod.meta.size)), fx = createFx(mod, { x: mod.meta.origin[0], y: mod.meta.origin[1], seed: 17, ...options });
  fx.update(time); fx.draw(frame, 'back'); fx.draw(frame, 'front'); return frame;
}
function same(a,b) { for (const key of ['color','light','hdrLight']) assert.deepEqual(a[key],b[key],key); }

test('relation and signed offsets survive project round trips and compilation without becoming resolved positions', async () => {
  const spec = linked(); spec.cues[1].at = -.04;
  const before = clone(spec), mod = await compile(spec);
  assert.deepEqual(spec,before); assert.deepEqual(mod.sequence,before);
  const project = createProject({id:'test/event-anchors',kind:'sequence',sequence:spec,actor:false});
  const restored = parseProject(serializeProject(project)); assert.deepEqual(restored,project);
  assert.deepEqual(restored.sequence.cues[1].eventAnchor,spec.cues[1].eventAnchor);
  assert.equal(restored.sequence.cues[1].at,-.04); assert.equal(restored.sequence.cues[1].x,2);
  same(raster(mod,1.5),raster(await compile(restored.sequence),1.5));
});

test('source edits recompute both clocks and points with flips/angles on nonzero endpoints and preserve offsets', async () => {
  for (const [distance,travel,angle,flip] of [[24,.25,0,false],[88,1.1,-.3,true],[160,3,.25,false]]) {
    const spec = linked(); Object.assign(spec.cues[0].source.intent,{distance,travel}); Object.assign(spec.cues[0],{angle,flip});
    const mod = await compile(spec), control = await compile(manual(spec));
    const at = .2 + .28 + travel + spec.cues[1].at;
    close(mod.events.find(e=>e.id==='response/release').at,at);
    for (const seed of [0,83]) for (const t of [at+.01,at+.2]) same(raster(mod,t,{seed}),raster(control,t,{seed}));
    assert.equal(mod.sequence.cues[1].x,2);
    assert.deepEqual(mod.events.find(e=>e.id==='response/release').payload,{x:-24,y:-16,material:'fire'});
  }
});

test('dependencies resolve independently of cue order while original painter order is retained', async () => {
  const spec = linked(); spec.cues.push(createSequenceSpec({cues:[{id:'third',source:gen('ice','shatter'),eventAnchor:{cue:'response',event:'arrival',targetEvent:'shatter'}}]}).cues[0]);
  const forward = await compile(spec);
  spec.cues.reverse(); const reversed = await compile(spec), control = await compile(manual(spec));
  assert.deepEqual(reversed.sequence.cues.map(c=>c.id),['third','response','pulse']);
  for (const id of ['pulse/arrival','response/release','third/shatter']) close(forward.events.find(e=>e.id===id).at,reversed.events.find(e=>e.id===id).at);
  same(raster(reversed,1.7),raster(control,1.7)); // never assert pixels invariant under paint order changes
});

test('hidden and disabled sources still anchor independent targets; hidden targets export no events', async () => {
  const spec = linked(); spec.cues[0].enabled=false;
  const mod = await compile(spec), control = await compile(manual(spec));
  assert(!mod.events.some(e=>e.cue==='pulse')); assert(mod.events.some(e=>e.cue==='response'));
  same(raster(mod,1.5),raster(control,1.5));
  spec.cues[0].enabled=true;
  const visible = await compile(spec), hidden = {layers:{pulse:false}};
  same(raster(visible,1.5,hidden),raster(mod,1.5));
  assert.equal(visible.eventsFor({layers:{response:false}}).some(e=>e.cue==='response'),false);
  assert.equal(visible.eventsFor({layers:{pulse:false}}).some(e=>e.cue==='response'),true);
});

test('cue seeds, zero, fades and layer filters retain manual output, including parent transforms', async () => {
  const spec = linked(); spec.cues[0].seed=0; spec.cues[1].seed=83; spec.cues[1].fadeIn=.2; spec.cues[1].fadeOut=.3; spec.cues[1].options={light:.6,layers:{sparks:false}};
  const mod = await compile(spec), control = await compile(manual(spec));
  for (const seed of [0,29]) for (const t of [1.01,1.3,1.8]) same(raster(mod,t,{seed,angle:.09,flip:true}),raster(control,t,{seed,angle:.09,flip:true}));
});

test('runtime backward seeks and loop resets equal baked manual outputs', async () => {
  const spec=linked(); spec.loop=true;
  const p=createProject({id:'test/event-anchors',kind:'sequence',sequence:spec,actor:false}), m=createProject({...p,sequence:manual(spec)});
  const a=await createProjectRuntime(p),b=await createProjectRuntime(m),duration=(await compile(spec)).meta.duration;
  for (const t of [1.5,.2,1.25,duration+.4,duration+1.5,0,1.5]) { const x=a.render(t,Math.floor(t*30),false),y=b.render(t,Math.floor(t*30),false); same(x.frame,y.frame); assert.deepEqual(x.rgba,y.rgba); }
  a.dispose();b.dispose();
});

test('invalid relationship shape, competing placement options and nonfinite offsets reject', () => {
  for (const anchor of [null,{},[],{cue:'pulse',event:'arrival'},{cue:'pulse',event:'arrival',targetEvent:'release',x:1},{cue:'bad/id',event:'arrival',targetEvent:'release'}]) {
    const spec=linked();spec.cues[1].eventAnchor=anchor;assert.throws(()=>createSequenceSpec(spec));
  }
  for (const key of ['at','x','y']) for (const value of [NaN,Infinity,'3']) {const s=linked();s.cues[1][key]=value;assert.throws(()=>createSequenceSpec(s));}
  for(const key of ['x','y']) {const s=linked();s.cues[1].options[key]=0;assert.throws(()=>createSequenceSpec(s),/offsets belong/);}
  const independent=linked();delete independent.cues[1].eventAnchor;independent.cues[1].at=-.1;assert.throws(()=>createSequenceSpec(independent),/start/);
});

test('missing cue/event, duplicate ids, cycles and unsupported source/target types reject', async () => {
  for (const [field,value] of [['cue','missing'],['event','missing'],['targetEvent','missing']]) {const s=linked();s.cues[1].eventAnchor[field]=value;await assert.rejects(compile(s));}
  const duplicate=linked();duplicate.cues[1].id='pulse';assert.throws(()=>createSequenceSpec(duplicate),/unique/);
  const self=linked();self.cues[1].eventAnchor.cue='response';await assert.rejects(compile(self),/cycle/);
  const cycle=linked();cycle.cues[0].eventAnchor={cue:'response',event:'arrival',targetEvent:'release'};await assert.rejects(compile(cycle),/cycle/);
  const target=linked();target.cues[1].source={kind:'catalog',id:'fire/torch'};assert.throws(()=>createSequenceSpec(target),/generation target/);
  const source=linked();source.cues[0].source={kind:'catalog',id:'fire/torch'};
  await assert.rejects(createSequenceEffect(source,async()=>({meta:{size:[10,10],origin:[5,5],duration:2},events:[{id:'arrival',at:1,payload:{x:0,y:0}}],draw(){}})),/generation sources/);
});

test('negative starts and out-of-range computed positions/times reject without cropping preparation', async () => {
  const s=linked();s.cues[1].at=-3;await assert.rejects(compile(s),/before zero.*preserve preparation/);
  const time=linked();time.cues[0].at=3600;await assert.rejects(compile(time),/resolved start/);
  const position=linked();position.cues[0].x=-65536;await assert.rejects(compile(position),/resolved x/);
});

test('source and target cue crops, sequence crops and loop terminal anchors reject consistently', async () => {
  for (const which of [0,1]) { const s=linked(); const event=createGenerationPlan2D(s.cues[which].source.intent).events.find(e=>e.id===(which?'release':'arrival'));s.cues[which].duration=event.at;await assert.rejects(compile(s),/outside.*window/); }
  const s=linked();s.duration=1.22;await assert.rejects(compile(s),/outside.*window/);
  const edge=linked();edge.loop=true;edge.duration=1.28;await assert.rejects(compile(edge),/outside.*window/);
  const valid=linked();valid.cues[0].duration=1.020001;await compile(valid);
});

test('outer project.seconds remains a deliberate export crop rather than altering the saved relation', async () => {
  const p=createProject({id:'test/outer-crop',kind:'sequence',sequence:linked(),seconds:.3,actor:false});
  const runtime=await createProjectRuntime(p);assert.equal(runtime.duration,.3);runtime.dispose();
  assert.equal(p.sequence.cues[1].eventAnchor.event,'arrival');
});

test('original stored compositions are byte-identical to their initial opt-in relations', async () => {
  for (const name of ['generated-energy-fracture','generated-storm-fire']) {
    const p=parseProject(readFileSync(new URL(`../examples/projects/${name}.poku-project.json`,import.meta.url),'utf8'));
    const s=p.sequence,c=s.cues[1],energy=name.includes('energy'),control=await compile(s);
    Object.assign(c,{eventAnchor:{cue:s.cues[0].id,event:energy?'arrival':'strike',targetEvent:energy?'shatter':'release'},at:energy?0:.28,x:0,y:0});
    const mod=await compile(s);
    for(const t of energy?[.95,1.05,1.25]:[.25,.55,.8]) same(raster(mod,t),raster(control,t));
  }
});


test('only bounded cancellation at mathematical zero is normalized, not negative preparation', async () => {
  const spec=createSequenceSpec({cues:[
    {id:'ice',source:gen('ice','shatter')},
    {id:'fire',source:gen('fire','burst'),at:-.14,eventAnchor:{cue:'ice',event:'shatter',targetEvent:'release'}},
  ]});
  assert(.36-.22-.14<0, 'regression genuinely has subtraction noise');
  const mod=await compile(spec),control=clone(spec);delete control.cues[1].eventAnchor;control.cues[1].at=0;
  close(mod.events.find(e=>e.id==='fire/release').at,.22);
  same(raster(mod,.25),raster(await compile(control),.25));
  spec.cues[1].at=-.140000000001;
  await assert.rejects(compile(spec),/before zero/);
});
