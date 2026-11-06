import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createPixelMaterial2D } from '../build/core/pixel-material.js';
import { diagnosePixelArt2D } from '../build/core/pixel-art-analysis.js';
import { createPixelArtStudy2D } from '../build/examples/pixel-art-study.js';
import { canvas, upscale } from '../build-tools/tools/lib/fxlib.mjs';
import { encodePNG } from '../build-tools/tools/lib/png.mjs';

const out=process.argv[2]??'records/pixel-art-lab';mkdirSync(out,{recursive:true});
const rgba=sprite=>{const data=new Uint8ClampedArray(sprite.w*sprite.h*4);for(let i=0;i<sprite.pixels.length;i++){const c=sprite.pixels[i];data.set([c&255,(c>>>8)&255,(c>>>16)&255,c>>>24],i*4);}return data;};
const cases=[['STONE','stone','stone-path'],['METAL','metal','blade'],['WOOD','wood','boulder'],['FABRIC','fabric','cloth'],['CRYSTAL','crystal','crystal']];
const sheet=canvas(1008,526,[12,18,24,255]),details=[];
sheet.text('NATIVE PIXEL MATERIAL AUTHORING',24,18,2,[217,234,206]);
sheet.text('SAME SOURCE / AUTHORED HEIGHT / DISCRETE PALETTE / NO BLUR',24,43,1,[142,163,176]);
for(const [column,[label,kind,shape]] of cases.entries()){
  const study=createPixelArtStudy2D(shape,41,true),options={kind,seed:41,scale:kind==='fabric'?12:15,
    roughness:kind==='metal'?.25:kind==='crystal'?.3:.65,ambient:.18,light:[-.67,-.74,.8]};
  const shader=createPixelMaterial2D(options),result=shader.shade(study.sprite,{height:study.height});
  const x=16+column*198;
  sheet.text(label,x+5,77,1,[206,230,192]);
  sheet.paste(rgba(study.sprite),192,112,x,106);
  sheet.paste(rgba(result),192,112,x,264);
  sheet.text('INPUT 1X',x+5,228,1,[118,145,160]);
  sheet.text('MATERIAL 1X',x+5,391,1,[174,204,158]);
  shader.options.palette.forEach((color,i)=>{
    const value=typeof color==='number'?color:parseInt(color.slice(1),16),rgb=typeof color==='number'?[value&255,(value>>>8)&255,(value>>>16)&255]:[(value>>>16)&255,(value>>>8)&255,value&255];
    sheet.rect(x+5+i*15,420,13,13,[...rgb,255]);
  });
  const before=diagnosePixelArt2D(study.sprite).metrics,after=diagnosePixelArt2D(result).metrics;
  sheet.text(`${after.paletteSize} COLORS`,x+5,453,1,[142,163,176]);
  sheet.text(`${(after.dominantFlatRegionRatio*100).toFixed(1)}% LARGEST REGION`,x+5,472,1,[142,163,176]);
  details.push({kind,shape,seed:41,nativeSize:[192,112],palette:shader.options.palette,before,after,
    sameAlpha:result.pixels.every((c,i)=>(c>>>24)===(study.sprite.pixels[i]>>>24)),
    sameSilhouette:result.mask.data.every((c,i)=>c===study.sprite.mask.data[i]),artisticQualityCertified:false});
  if(kind==='stone'){
    writeFileSync(join(out,'stone-native.png'),encodePNG(192,112,rgba(result)));
    const compare=canvas(816,347,[12,18,24,255]);
    compare.text('SAME NATIVE SHAPE / FLAT SOURCE',18,16,1,[151,172,187]);
    compare.text('MATERIAL + RELIEF + SELECTIVE EDGES',426,16,1,[208,231,193]);
    compare.paste(upscale(rgba(study.sprite),192,112,2),384,224,16,52);
    compare.paste(upscale(rgba(result),192,112,2),384,224,424,52);
    compare.text('PALETTE / SHADOW TO LIGHT',426,296,1,[151,172,187]);
    shader.options.palette.forEach((color,i)=>{const c=typeof color==='number'?color:parseInt(color.slice(1),16);compare.rect(426+i*32,316,28,10,typeof color==='number'?[c&255,(c>>>8)&255,(c>>>16)&255,255]:[(c>>>16)&255,(c>>>8)&255,c&255,255]);});
    writeFileSync(join(out,'stone-comparison.png'),compare.png());
  }
}
sheet.text('STUDIES ARE NEW TOOL OUTPUTS; EXISTING EFFECTS ARE UNMODIFIED.',24,505,1,[122,146,161]);
writeFileSync(join(out,'material-studies.png'),sheet.png());
writeFileSync(join(out,'metrics.json'),JSON.stringify({schema:'poku.pixel-art-evidence/v1',cases:details},null,2)+'\n');
console.log(JSON.stringify({output:out,files:['stone-native.png','stone-comparison.png','material-studies.png','metrics.json']}));
