import {Painter,type PaintFrame} from '../core/painter.js';
import {hex} from '../core/color.js';
import {createStudioCharacter2D,createCharacterAsset2D,type CharacterAsset2D} from '../core/character-asset.js';
import {createSerpentRig2D} from '../core/creature-asset.js';
import {encodeSpritePixels2D} from '../core/sprite-raster.js';
import type {SpriteClipFrame2D} from '../core/sprite-clip.js';

/** An authored 20×24 raster actor. No human generator is involved in its silhouettes or frame timing. */
export function createLanternlingCharacter2D():CharacterAsset2D{
  const width=20,height=24,frames:SpriteClipFrame2D[]=[];
  for(let cel=0;cel<4;cel++){
    const f:PaintFrame={w:width,h:height,ox:0,oy:0,color:new Uint32Array(width*height),light:new Uint32Array(width*height)},p=new Painter(f),bob=cel&1;
    p.poly([[7,3+bob],[12,3+bob],[15,6+bob],[15,16+bob],[12,19+bob],[6,19+bob],[3,16+bob],[3,6+bob]],hex('#27394c'));
    p.rect(5,7+bob,9,9,hex('#b27545'));p.rect(6,8+bob,7,7,hex('#e6bf72'));p.rect(7,8+bob,2,6,hex('#ffe4a0'));
    p.rect(4,5+bob,10,2,hex('#5a7983'));p.rect(5,16+bob,9,2,hex('#5a7983'));p.rect(7,2+bob,5,2,hex('#8fa7a5'));
    p.px(7,11+bob,hex('#27394c'));p.px(11,11+bob,hex('#27394c'));p.line(8,14+bob,10,14+bob,hex('#a56a44'));
    p.rect(cel<2?4:6,20-bob,4,2,hex('#5a7983'));p.rect(cel<2?12:10,20+bob,4,2,hex('#5a7983'));
    p.line(2,11+bob,0,14,hex('#8fa7a5'));p.line(16,11+bob,18,8+cel%2,hex('#8fa7a5'));
    const emission=new Float32Array(width*height*3);
    for(let y=8+bob;y<15+bob;y++)for(let x=6;x<13;x++){const i=(y*width+x)*3;emission[i]=.15+cel*.015;emission[i+1]=.075;emission[i+2]=.015;}
    frames.push({durationMs:cel&1?180:120,runs:encodeSpritePixels2D(f.color),emission:Array.from(emission),sockets:{root:{x:10,y:22},head:{x:10,y:5+bob},chest:{x:10,y:12+bob},'hand.grip':{x:18,y:8+cel%2,angle:-Math.PI/4},hand:{x:18,y:8+cel%2},foot:{x:6,y:21},otherFoot:{x:14,y:21}}});
  }
  const clip={version:1 as const,width,height,pivot:[10,22] as const,frames,tags:[{name:'walk',from:0,to:3,direction:'forward' as const}],source:{author:'Original Poku example',kind:'hand-authored-native-cels'}};
  return createCharacterAsset2D({schema:'poku.character/v1',id:'lanternling',name:'Lanternling',nativeHeight:24,source:{kind:'sprite',clip,options:{loop:true,emissionKind:'surface'}},defaultClip:'walk',clips:{walk:{kind:'sprite',options:{tag:'walk',loop:true,emissionKind:'surface'},events:[{id:'left-step',at:0,kind:'footstep',socket:'foot'},{id:'right-step',at:.3,kind:'footstep',socket:'otherFoot'}]}}});
}
export function createSerpentCharacter2D():CharacterAsset2D{
  const rig=createSerpentRig2D(64);return createCharacterAsset2D({schema:'poku.character/v1',id:rig.id,name:'Moss Serpent',nativeHeight:64,source:{kind:'creature-rig',rig},defaultClip:'slither',clips:{slither:{kind:'creature-rig',duration:2}}});
}
/** Original archetypes share the same authoring contract, while anatomy and identity remain editable. */
export function createCharacterReferencePack2D():Record<string,CharacterAsset2D>{
  return{
    wayfarer:createStudioCharacter2D(),
    copperSmith:createStudioCharacter2D({id:'copper-smith',name:'Copper Smith',height:96,style:{build:'broad',skin:'brown',hair:'shaved',facialHair:'beard',hairColor:'dark',faceShape:'square',outfit:'overalls',cloth:['#59474f','#956653','#d2a076'],trousers:['#2e424d','#4b6770','#789696']}}),
    lanternling:createLanternlingCharacter2D(),mossSerpent:createSerpentCharacter2D(),
  };
}
