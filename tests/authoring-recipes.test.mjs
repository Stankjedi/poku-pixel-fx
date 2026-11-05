import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createFrame,createFx} from '../build/core/fx.js';
import {createRecipeSpec,createRecipeEffect,RECIPE_KINDS,recipePosition} from '../build/authoring/recipes.js';
import {resolveParameters,invalidationFor} from '../build/authoring/parameters.js';
import {searchEffects,catalogEntries,loadCatalogEffect} from '../build/authoring/registry.js';
import {validateIntentBrief} from '../tools/lib/effect-intent.mjs';
const ids=['melee/tempered-crescent','melee/socket-ribbon-slash','lightning/focused-arc','explosions/layered-detonation','fire/folded-flame','arcane/depth-portal'];
function draw(mod,time,seed=1){const f=createFrame(...mod.meta.size),fx=createFx(mod,{x:mod.meta.origin[0],y:mod.meta.origin[1],seed});fx.update(time);fx.draw(f);return f;}
for(let k=0;k<RECIPE_KINDS.length;k++)test(`recipe ${RECIPE_KINDS[k]} has intent, deterministic visible structure and correct ending`,()=>{
  const kind=RECIPE_KINDS[k],spec=createRecipeSpec(kind),mod=createRecipeEffect(spec),time=kind==='thrown-blade'?.6:.4;
  validateIntentBrief(JSON.parse(readFileSync(new URL(`../authoring/${ids[k]}.intent.json`,import.meta.url),'utf8')),ids[k]);
  const a=draw(mod,time),b=draw(mod,time);assert(a.color.some(c=>c>>>24));assert.deepEqual(a.color,b.color);assert.deepEqual(a.light,b.light);
  const end=draw(mod,spec.duration);if(!spec.loop){assert(end.color.every(c=>c===0));assert(end.light.every(c=>c===0));}else{assert.deepEqual(end.color,draw(mod,0).color);assert.deepEqual(end.light,draw(mod,0).light);}
  const dark=createRecipeEffect({...spec,layers:{...spec.layers,glow:false}});assert(draw(dark,time).color.some(c=>c>>>24));
});
test('rotation speed is independent of thrown path, and palette/density schema validates',()=>{
  const a=createRecipeSpec('thrown-blade'),b=createRecipeSpec('thrown-blade',{parameters:{spin:7}});
  assert.deepEqual(recipePosition(a,.5),recipePosition(b,.5));assert.throws(()=>createRecipeSpec('flame',{parameters:{density:999}}));
  const schema=[{key:'size',label:'size',type:'number',default:2,min:1,max:4,invalidates:'asset'}];assert.throws(()=>resolveParameters(schema,{size:0}));assert.equal(invalidationFor(schema,{size:2},{size:3}),'asset');
});
test('runtime seed controls seeded recipe detail independently of the stored default',()=>{
  const mod=createRecipeEffect(createRecipeSpec('portal'));
  assert.notDeepEqual(draw(mod,.3,5).color,draw(mod,.3,6).color);assert.deepEqual(draw(mod,.3,5).color,draw(mod,.3,5).color);
});
test('default contact fragments and explosion pressure stay inside their native export canvas',()=>{
  const margin=64;
  for(const kind of ['thrown-blade','ribbon-slash','lightning','explosion']){
    const mod=createRecipeEffect(createRecipeSpec(kind)),[w,h]=mod.meta.size;
    for(const seed of [1,2,3,7])for(const time of [.42,.59,.76,1,1.4,1.9]){
      const frame=createFrame(w+margin*2,h+margin*2,-margin,-margin);
      const fx=createFx(mod,{x:mod.meta.origin[0],y:mod.meta.origin[1],seed});fx.update(time);fx.draw(frame);
      for(let i=0;i<frame.color.length;i++)if(frame.color[i]>>>24){
        const x=i%frame.w-margin,y=Math.floor(i/frame.w)-margin;
        assert(x>=0&&x<w&&y>=0&&y<h,`${kind} seed=${seed} t=${time} paints outside at ${x},${y}`);
      }
    }
  }
});
test('catalog metadata and lazy loaders include new recipes and semantic search routes Korean intent',async()=>{
  for(const id of ids){assert(catalogEntries.some(x=>x.id===id));assert.equal((await loadCatalogEffect(id)).recipe.schema,'poku.effect-recipe/v1');}
  assert(searchEffects('회전 검',30).some(e=>e.id==='melee/tempered-crescent'));
  await assert.rejects(()=>loadCatalogEffect('melee/typo-effect'),/Unknown effect/);
});
