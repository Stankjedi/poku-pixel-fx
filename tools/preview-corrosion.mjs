#!/usr/bin/env node
// Render after npm run build. Labels, transforms and backgrounds are preview-only.
import { join } from 'node:path';
import { createFx,createFrame,clearFrame,composite,painterFor,backdrop,hex } from '../build/core/index.js';
import * as acid from '../build/fx/nature/acid-splash.js';
import { writeVideo,save,contactSheet } from '../build-tools/tools/lib/fxlib.mjs';
const out=process.argv[2]??'records/corrosion-review',cw=264,W=cw*3,H=180,fps=30;
const variants=[{label:'METAL CONTACT',seed:6},{label:'NO GLOW',seed:12,light:0},{label:'AMBER / MIRRORED',seed:21,flip:true,palette:['#27150e','#563024','#895034','#b97b43','#dca964','#efd09a','#fff0c6']}];
const instances=variants.map((v,i)=>createFx(acid,{...v,x:i*cw+132,y:154})),f=createFrame(W,H),bg=backdrop('ground',W,H,154),frames=[];
for(let i=0;i<=102;i++){
 if(i)instances.forEach(fx=>fx.update(1/fps));clearFrame(f);
 for(let j=0;j<instances.length;j++){instances[j].draw(f);painterFor(f).text(variants[j].label,j*cw+cw/2,6,hex('#c9d0cd'),{align:'center'});}
 const rgba=composite(f,new Uint8ClampedArray(W*H*4),bg);frames.push({t:i/fps,color:rgba,clear:rgba});
}
const r={w:W,h:H,fps,n:frames.length,frames};
if(!writeVideo(join(out,'acid-material-review.gif'),r,2))throw new Error('ffmpeg is required for the encoded review');
save(join(out,'review-contact.png'),contactSheet({id:'acid-material-review',meta:acid.meta},r,{max:9,cols:1,zoom:1}));
console.log(`Corrosion review: ${out}; one shared contact at ${acid.ACID_CONTACT_TIME}s; distinct fluid/metal, no glow and palette/flip variants.`);
