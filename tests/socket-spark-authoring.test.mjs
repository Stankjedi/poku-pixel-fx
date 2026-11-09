import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,existsSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {authorSocketSparks} from '../examples/author-socket-sparks.mjs';
import {createSocketSparkRecipe} from '../examples/lib/socket-spark-recipe.mjs';
import {createFrame,createFx,composite} from '../build/core/fx.js';
const config=JSON.parse(readFileSync(new URL('../examples/socket-sparks/turning-torch.config.json',import.meta.url)));
const intent=JSON.parse(readFileSync(new URL('../examples/socket-sparks/turning-torch.intent.json',import.meta.url)));
const temp=mkdtempSync(join(tmpdir(),'poku-socket-authoring-'));
function frame(effect,t){const f=createFrame(96,64),fx=createFx(effect);fx.update(t);fx.draw(f);const rgba=new Uint8ClampedArray(96*64*4);composite(f,rgba,null);return rgba;}
test('create a new saved effect; actual runtime repeat, empty ending and selected attributes',async()=>{
 const out=join(temp,'new'),result=authorSocketSparks({config,intent,out});
 const e=await import(pathToFileURL(result.effect));
 assert.deepEqual(e.config,config);assert.equal(e.births.length,18);assert.equal(e.births.filter(b=>b.source.fallbackReason==='hidden').length,4);
 e.births.forEach((b,i)=>{assert.deepEqual(b.event,config.events[i]);assert.equal(b.source.birthTime,b.event.birthMs/1000);assert.equal(b.source.clipTime,(b.event.birthMs-50)/1000);});
 assert.deepEqual(frame(e,.23),frame(e,.23));assert.ok(frame(e,.23).some(v=>v));assert.ok(frame(e,.8).every(v=>v===0));
 const before=readFileSync(result.effect);assert.throws(()=>authorSocketSparks({config,intent,out}),/already exists/);assert.deepEqual(readFileSync(result.effect),before);
});
test('invalid socket/config/intent fail before writing; existing file stays intact',()=>{
 for(const [name,change] of [['socket',c=>{c.events[0].socket='absent';delete c.events[0].fallbackSocket;}],['life',c=>c.events[0].lifeMs=500],['clock',c=>c.clipClockOffsetMs=NaN],['root',c=>c.roots[1].atMs=0]]){
  const c=structuredClone(config);change(c);const out=join(temp,name);assert.throws(()=>authorSocketSparks({config:c,intent,out}));assert.equal(existsSync(out),false);
 }
 const bad=structuredClone(intent);bad.timeline.durationSeconds=1;assert.throws(()=>authorSocketSparks({config,intent:bad,out:join(temp,'intent')}));assert.equal(existsSync(join(temp,'intent')),false);
 const out=join(temp,'protected');writeFileSync(out,'previous',{flag:'wx'});assert.throws(()=>authorSocketSparks({config,intent,out}));assert.equal(readFileSync(out,'utf8'),'previous');
});
test('snapshot ownership, skip and zero retain caller schedule',()=>{
 const c=structuredClone(config),e=createSocketSparkRecipe(c),before=JSON.stringify(e.births);c.roots[2].position[0]+=100;c.events[0].velocity[0]+=100;
 assert.equal(JSON.stringify(e.births),before);assert.ok(Object.isFrozen(e.births[0].event));frame(e,.5);assert.equal(JSON.stringify(e.births),before);
 const skipped=structuredClone(config);skipped.events[0].socket='missing';delete skipped.events[0].fallbackSocket;skipped.events[0].unavailable='skip';const b=createSocketSparkRecipe(skipped).births;assert.equal(b.length,18);assert.equal(b[0].source,null);
 const zero=structuredClone(config);zero.events=[];assert.equal(createSocketSparkRecipe(zero).births.length,0);
});
test('positive and negative offset boundary: captured pose matches actually drawn clip',async()=>{
 const {Painter}=await import('../build/core/painter.js');
 for(const [offset,birth] of [[600,300],[-600,1500]]){
  const c={version:1,name:'Boundary',size:[16,16],origin:[0,0],durationMs:2200,clipClockOffsetMs:offset,
   clip:{version:1,width:1,height:1,pivot:[0,0],frames:[{durationMs:900,runs:[1,0xff0000ff],sockets:{tip:{x:5,y:0}}},{durationMs:1400,runs:[1,0xff00ff00],sockets:{tip:{x:5,y:0}}}]},
   roots:[{atMs:0,position:[0,0]},{atMs:2200,position:[0,0]}],events:[{id:'one',sourceRole:'test',birthMs:birth,lifeMs:100,socket:'tip',unavailable:'throw',velocity:[0,0],color:0xffffffff,light:0}]};
  const e=createSocketSparkRecipe(c);assert.equal(e.births[0].source.frame,1);
  for(const [dt,color] of [[-.0001,0xff0000ff],[0,0xff00ff00],[.0001,0xff00ff00]]){
   const f=createFrame(16,16);e.draw(new Painter(f),birth/1000+dt);assert.equal(f.color[0],color);
  }
 }
});
test('extra JSON attributes including own __proto__ survive generated source exactly',async()=>{
 const c=structuredClone(config);Object.defineProperty(c.events[0],'__proto__',{value:{authored:'data-only'},enumerable:true,writable:true,configurable:true});
 const result=authorSocketSparks({config:c,intent,out:join(temp,'json-attributes')});
 const e=await import(pathToFileURL(result.effect));assert.deepEqual(e.config,c);assert.deepEqual(e.births[0].event,c.events[0]);assert.equal(Object.getPrototypeOf(e.config.events[0]),Object.prototype);assert.equal(e.config.events[0].authored,undefined);assert.equal(Object.hasOwn(e.config.events[0],'__proto__'),true);
});
