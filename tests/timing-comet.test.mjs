import test from 'node:test';
import assert from 'node:assert/strict';
import {createFrame,createFx,Painter} from '../build/core/index.js';
import * as effect from '../build/fx/projectiles/timing-comet.js';
function frame(t,coast=true){const f=createFrame(320,160),fx=createFx(effect,{x:112,y:104,coast});fx.update(t);fx.draw(f);return f;}
test('the example changes only the endpoint motion policy, not earlier drawing or other tracks',()=>{
 for(const t of[.1,.4,.8,1.25])assert.deepEqual(frame(t,true),frame(t,false));
 const hold=effect.createCometTracks(false),coast=effect.createCometTracks(true);
 assert.deepEqual(hold.travel.sample(1.8),{value:52,velocity:0});assert.deepEqual(coast.travel.sample(1.8),{value:126.25,velocity:135});
 for(const channel of['width','opacity','light'])assert.deepEqual(hold[channel].sample(1.8),coast[channel].sample(1.8));
 assert.notDeepEqual(frame(1.8,true).color,frame(1.8,false).color);
});
test('the example is directly seekable and both endpoint choices finish empty',()=>{
 const impl=effect.create({...effect.meta.options});const direct=t=>{const f=createFrame(320,160);impl.draw(new Painter(f).place(112,104),t);return f;};
 const a=direct(1.8);direct(.3);direct(2.4);assert.deepEqual(a,direct(1.8));
 for(const coast of[true,false])for(const t of[0,2.4,2.5]){const f=frame(t,coast);assert.ok(f.color.every(c=>c===0));assert.ok(f.light.every(c=>c===0));}
});
