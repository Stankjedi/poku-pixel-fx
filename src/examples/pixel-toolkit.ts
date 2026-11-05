import {Painter,type PaintFrame} from '../core/painter.js';
import {hex} from '../core/color.js';
import {indexSprite2D,renderIndexedSprite2D,ditherSprite2D,selectiveOutline2D,compileAuthoredPixelTrack2D,applyOpticalCorrection2D,type AuthoredPixelTrack2D} from '../core/pixel-tools.js';
import {createMaterialChannels2D,createMaterialShader2D,textureMaterial2D} from '../core/material-surface.js';
import {createPixelStyleProfile2D} from '../core/pixel-style.js';
import type {RasterSprite2D} from '../core/sprite-raster.js';

const C={ink:hex('#26354d'),dark:hex('#3e6578'),body:hex('#63a29c'),light:hex('#a2d8bb'),glint:hex('#e7efc1')};
function cell(paint:(p:Painter)=>void):RasterSprite2D{
  const frame:PaintFrame={w:32,h:32,ox:0,oy:0,color:new Uint32Array(1024),light:new Uint32Array(1024)},p=new Painter(frame);paint(p);
  return{x:0,y:0,w:32,h:32,pixels:frame.color,mask:{w:32,h:32,data:Uint8Array.from(frame.color,c=>c>>>24?1:0)}};
}
export const AUTHORED_SUBPIXEL_STUDY:AuthoredPixelTrack2D={duration:1,loop:true,purpose:'subpixel',allowedColors:[C.body,C.light,C.glint],keys:[
  {at:0,patches:[{x:10,y:9,rows:['ll','gg'],palette:{l:C.light,g:C.glint}}]},
  {at:.25,patches:[{x:10,y:9,rows:['blg','bgl'],palette:{b:C.body,l:C.light,g:C.glint}}]},
  {at:.5,patches:[{x:10,y:9,rows:['bll','bgg'],palette:{b:C.body,l:C.light,g:C.glint}}]},
  {at:.75,patches:[{x:10,y:9,rows:['blg','bgl'],palette:{b:C.body,l:C.light,g:C.glint}}]},
]};
/** Native studies suitable for a tool shelf/contact sheet; all colors and clusters are authored here. */
export function createPixelToolkitStudies2D(time=0):{name:string;sprite:RasterSprite2D;note:string}[]{
  const base=cell(p=>{p.poly([[8,6],[22,6],[26,10],[26,23],[22,27],[8,27],[4,23],[4,10]],C.body);p.poly([[8,6],[22,6],[23,9],[9,9],[7,12],[4,12],[4,10]],C.light);p.poly([[23,11],[26,10],[26,23],[22,27],[8,27],[7,24],[22,24]],C.dark);});
  const outlined=selectiveOutline2D(base,{shadow:C.ink,light:C.light,side:C.dark,lightDirection:[-1,-1],omitLit:true});
  const transparent={...base,pixels:Uint32Array.from(base.pixels,c=>c>>>24?((c&0xffffff)|(128<<24))>>>0:0)};
  const palette=[C.dark,C.body,C.light],flat=cell(p=>{p.rect(5,7,22,18,C.body);for(let i=0;i<3;i++)p.rect(6+i*7,8,6,16,palette[i]);});
  const indexed=indexSprite2D(flat,palette),cycled=renderIndexedSprite2D(indexed,time,[{indices:[0,1,2],fps:3}]);
  const aa=compileAuthoredPixelTrack2D({duration:1,purpose:'aa',allowedColors:[C.light],keys:[{at:0,patches:[{x:3,y:10,rows:['a','a'],palette:{a:C.light}},{x:7,y:5,rows:['aa'],palette:{a:C.light}}]}]})(base,time);
  const subpixel=compileAuthoredPixelTrack2D(AUTHORED_SUBPIXEL_STUDY)(base,time);
  const corrected=applyOpticalCorrection2D(base,32,[{minHeight:16,maxHeight:32,patches:[{x:10,y:15,rows:['x...x'],palette:{x:C.ink}},{x:14,y:20,rows:['xx'],palette:{x:C.dark}}]}]);
  const height=new Float32Array(1024);for(let y=0;y<32;y++)for(let x=0;x<32;x++)height[y*32+x]=Math.sqrt(Math.max(0,100-(x-16)**2-(y-16)**2))*.55;
  const channels=createMaterialChannels2D(32,32,{height,defaultMaterial:1});
  const metallic=createMaterialShader2D([{id:1,palette:['#333b50','#596f87','#9fb7c3','#e6e3c7'],thresholds:[.18,.52,.82],highlight:{color:'#fff3ce',threshold:.7},specularPower:24}], [{position:[8+Math.sin(time*2)*10,5,20],radius:64,intensity:1.1}], {ambient:.08})(base,channels);
  const glass=createMaterialShader2D([{id:1,palette:['#203e59','#347080','#6caab0','#bdd9cc'],thresholds:[.12,.7,.93],highlight:{color:'#eaf3dc',threshold:.62},specularPower:48,emission:[.025,.05,.04]}],[{position:[4,4,16],radius:52,intensity:1.2}],{ambient:.1})(base,channels);
  const fabric=textureMaterial2D(base,{kind:'woven',palette:[C.dark,C.body,C.light],coordinates:{anchor:'object',scale:2}});
  const stone=textureMaterial2D(base,{kind:'stone',palette:[hex('#6a6677'),hex('#8c8a90'),hex('#b9b3a6')],coordinates:{anchor:'object'},seed:317});
  const hatch=textureMaterial2D(base,{kind:'hatch',palette:[C.dark,C.body],coordinates:{anchor:'object'}});
  return[
    {name:'Native clusters',sprite:base,note:'Three connected shade masses'},
    {name:'Selective contour',sprite:outlined,note:'Lit edge opens; shadow remains one cell'},
    {name:'Object dither',sprite:ditherSprite2D(transparent,{anchor:'object',pattern:'bayer4'}),note:'Explicit coverage pattern, never implicit alpha policy'},
    {name:'Palette cycle',sprite:cycled as RasterSprite2D,note:'Index order animates without moving pixels'},
    {name:'Authored AA',sprite:aa as RasterSprite2D,note:'Only palette-approved edge substitutions'},
    {name:'Subpixel keys',sprite:subpixel as RasterSprite2D,note:'Highlight weight changes between held native cels'},
    {name:'Optical correction',sprite:corrected,note:'Small native face marks, authored for one size tier'},
    {name:'Metal normal',sprite:metallic,note:'Height-derived normals choose discrete metal ramp colors'},
    {name:'Glass ramp',sprite:glass,note:'Narrow specular band plus independent linear emission'},
    {name:'Woven cloth',sprite:fabric,note:'Object-anchored repeating material brush'},
    {name:'Stone cluster',sprite:stone,note:'Seeded three-cell grain; no temporal reseeding'},
    {name:'Hatch brush',sprite:hatch,note:'Explicitly selected diagonal shade texture'},
  ];
}
export const PIXEL_TOOLKIT_PROFILE=createPixelStyleProfile2D({name:'Five-color native studies',nativeResolution:[256,192],surfaceColors:'indexed',palette:Object.values(C),alpha:'solid',outline:'none',emission:'none',finalColorPolicy:'palette-locked',poseSampling:'authored-cels'});
