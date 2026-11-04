#!/usr/bin/env node
// Run after npm run build. Compare mineral reactions without fire, glow or scene jitter.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGroundImpact, defineImpactContact2D, impactContactAge2D, fit } from '../build/core/index.js';
import { renderFrames, contactSheet, writeVideo, save } from '../build-tools/tools/lib/fxlib.mjs';
const palette=fit(['#19171b','#312a29','#514238','#77614e','#a0896c','#c5b18b'],6);
const contacts=['stone','soil'].map((material,i)=>defineImpactContact2D({id:material,at:.25,position:[i?90:-90,0],normal:[0,-1],material,strength:1.1,radius:24}));
const mod={
  meta:{name:'Mineral ground contacts',size:[384,128],origin:[192,104],duration:2.6,loop:false,fps:30,bg:'ground',options:{seed:17}},
  contacts:()=>contacts,
  create(options){
    const responses=contacts.map(c=>createGroundImpact({seed:options.seed,radius:c.radius,strength:c.strength,material:c.material,duration:2.1}));
    const layer=(p,time,which)=>contacts.forEach((c,i)=>responses[i].draw(p,impactContactAge2D(c,time),which,{x:c.position[0],palette}));
    return {drawBack:(p,t)=>layer(p,t,'back'),draw(p,t){layer(p,t,'front');p.text('STONE',-90,-76,palette[5],{align:'center'});p.text('SOIL',90,-76,palette[5],{align:'center'});}};
  },
};
const fx={id:'examples/ground-contacts',file:fileURLToPath(import.meta.url),mod,meta:mod.meta},out=process.argv[2]??'records/ground-contacts';
const frames=renderFrames(fx);save(join(out,'contact.png'),contactSheet(fx,frames,{max:12}));
if(!writeVideo(join(out,'ground-materials.gif'),frames,3,{loops:1}))process.exitCode=1;
console.log(`Ground material comparison: ${out}`);
