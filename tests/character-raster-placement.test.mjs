import test from 'node:test';
import assert from 'node:assert/strict';
import {Painter} from '../build/core/painter.js';
import {createCharacterAsset2D,createCharacterPlayer2D,createStudioCharacter2D,setCharacterSocketKey2D,serializeCharacterAsset2D,parseCharacterAsset2D} from '../build/core/character-asset.js';
import {createPixelStyleProfile2D} from '../build/core/pixel-style.js';
import {socketTransform2D} from '../build/core/character-animation.js';
import {pixelTransform2D,composePixelTransform2D,invertPixelTransform2D,transformSprite2D,encodeSpritePixels2D} from '../build/core/sprite-raster.js';

const almost=(a,b)=>assert.ok(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const colorA=0xffa36227,colorB=0xff5cbed4,mark=0xffdc91f4;
const raster=(w,h,pixels,x=0,y=0)=>({w,h,x,y,pixels,mask:{w,h,data:Uint8Array.from(pixels,c=>c>>>24?1:0)}});
// Independent inverse-coordinate oracle: attachment and placement act on continuous source cells.
function sourcePoint(m,x,y){
  const det=m[0]*m[3]-m[1]*m[2],dx=x-m[4],dy=y-m[5];
  return[(m[3]*dx-m[2]*dy)/det,(-m[1]*dx+m[0]*dy)/det];
}
function nativeIndex(sprite,m,x,y){
  const [px,py]=sourcePoint(m,x,y),sx=Math.floor(px-sprite.x),sy=Math.floor(py-sprite.y);
  return sx<0||sy<0||sx>=sprite.w||sy>=sprite.h?-1:sy*sprite.w+sx;
}
function sourceAsset({width=9,height=7,pivot=[1.25,2.25],pixels,emission,grip,offset=[1.2,-.7],angle=-.25,pixelStyle}={}){
  pixels??=Uint32Array.from({length:width*height},(_,i)=>i%7===0?0:i%3===0?colorA:colorB);
  const a=.63,c=Math.cos(a),s=Math.sin(a);
  grip??={x:3.4,y:-2.6,basisX:[-c,-s],basisY:[-s,c]};
  const sprite=raster(width,height,pixels,-pivot[0],-pivot[1]);
  const asset=createCharacterAsset2D({schema:'poku.character/v1',id:'layer-raster-study',name:'Layer raster study',nativeHeight:16,defaultClip:'play',
    source:{kind:'sprite',clip:{version:1,width:1,height:1,pivot:[0,0],frames:[{durationMs:800,runs:[1,0],sockets:{grip}}]}},
    clips:{play:{kind:'sprite',options:{loop:true}}},
    layers:[{id:'gear',semantic:'metal',socket:'grip',offset,angle,clip:{version:1,width,height,pivot,frames:[{durationMs:800,runs:encodeSpritePixels2D(pixels),...(emission?{emission}:{})}]}}],
    ...(pixelStyle?{pixelStyle}:{})});
  return{asset,sprite};
}
function layerMatrix(sample,asset){
  const layer=asset.layers[0];
  return composePixelTransform2D(socketTransform2D(sample.sockets.grip),pixelTransform2D(layer.offset?.[0]??0,layer.offset?.[1]??0,layer.angle??0));
}

test('fractional character placement samples gear color, semantic masks and independent HDR from one composed transform',()=>{
  const emission=Array.from({length:9*7*3},(_,i)=>(i%11)/8),{asset,sprite}=sourceAsset({emission}),player=createCharacterPlayer2D(asset);
  for(const [x,y]of [[.45,.35],[-.4,.6],[3.8,-2.2]]){
    const sample=player.sample(.2,'play',{x,y}),m=layerMatrix(sample,asset),body=sample.actor;
    let occupied=0,lightOnly=0;
    for(let yy=0;yy<body.h;yy++)for(let xx=0;xx<body.w;xx++){
      const i=yy*body.w+xx,j=nativeIndex(sprite,m,body.x+xx+.5,body.y+yy+.5),color=j<0?0:sprite.pixels[j];
      assert.equal(body.pixels[i],color,`native color at ${body.x+xx},${body.y+yy}`);
      assert.equal(sample.semanticMasks.metal?.[i]??0,color>>>24?1:0);
      for(let ch=0;ch<3;ch++)almost(sample.emission[i*3+ch],j<0?0:emission[j*3+ch]);
      occupied+=!!color;if(!color&&sample.emission[i*3]>0)lightOnly++;
    }
    assert.ok(occupied>20);assert.ok(lightOnly>0,'transparent emissive source cells survive the same transform');
    const drawn={w:body.w,h:body.h,ox:body.x,oy:body.y,color:new Uint32Array(body.pixels.length),light:new Uint32Array(body.pixels.length)};
    const p=new Painter(drawn);sample.drawBack(p);sample.drawFront(p);
    assert.deepEqual(drawn.color,body.pixels);assert.deepEqual(drawn.hdrLight,sample.emission);
  }
  const atOrigin=player.sample(.2),placed=player.sample(.2,'play',{x:.45,y:.35});
  const oldDoubleBake=transformSprite2D(transformSprite2D(sprite,layerMatrix(atOrigin,asset)),pixelTransform2D(.45,.35));
  const direct=transformSprite2D(sprite,layerMatrix(placed,asset));
  assert.notDeepEqual(oldDoubleBake.pixels,direct.pixels,'fixture exercises a former lossy intermediate bake');
});

test('object dither follows the native equipment basis while world and screen patterns use final placement',()=>{
  const width=12,height=10,pixels=new Uint32Array(width*height).fill(0x80808080),placements=[[.3,.2],[-.6,2.4]],bayer=[0,2,3,1];
  for(const anchor of ['object','world','screen']){
    const pixelStyle=createPixelStyleProfile2D({alpha:'authored-dither',dither:{anchor,pattern:'bayer2',phase:[.5,.5]}}),{asset,sprite}=sourceAsset({width,height,pivot:[0,0],pixels,pixelStyle}),player=createCharacterPlayer2D(asset);
    for(const [x,y]of placements){
      const worldToScreen=pixelTransform2D(1,2),sample=player.sample(.2,'play',{x,y,pixelContext:{worldToScreen}}),m=layerMatrix(sample,asset),out=sample.actor;
      for(let yy=0;yy<out.h;yy++)for(let xx=0;xx<out.w;xx++){
        const wx=out.x+xx+.5,wy=out.y+yy+.5,j=nativeIndex(sprite,m,wx,wy),i=yy*out.w+xx;
        const [px,py]=anchor==='object'?sourcePoint(m,wx,wy):anchor==='world'?[wx,wy]:[wx+1,wy+2];
        const bx=((Math.floor(px+.5)%2)+2)%2,by=((Math.floor(py+.5)%2)+2)%2;
        const expected=j>=0&&128/255>(bayer[by*2+bx]+.5)/4?0xff808080:0;
        assert.equal(out.pixels[i],expected,`${anchor} at ${wx},${wy}`);
        assert.equal(sample.semanticMasks.metal?.[i]??0,expected?1:0);
      }
    }
  }
});

test('layer-local edits follow gear pixels and original gear cels through independent timing and changed sockets',()=>{
  const gear={version:1,width:3,height:3,pivot:[1,1],frames:[
    {durationMs:100,runs:[9,colorA],emission:Array(27).fill(.5)},
    {durationMs:100,runs:[9,colorB],emission:Array(27).fill(.75)},
  ]};
  const base={schema:'poku.character/v1',id:'layer-cel-edit-study',name:'Layer cel edit study',nativeHeight:16,defaultClip:'play',
    source:{kind:'sprite',clip:{version:1,width:1,height:1,pivot:[0,0],frames:[
      {durationMs:400,runs:[1,0],sockets:{grip:{x:5.2,y:-1.1,angle:.4}}},
      {durationMs:400,runs:[1,0],sockets:{grip:{x:1.4,y:4.3,angle:1.2}}},
    ]}},clips:{play:{kind:'sprite',options:{loop:true}}},layers:[{id:'gear',clip:gear,semantic:'metal',socket:'grip'}],
    celEdits:[
      {id:'source-highlight',target:'gear',space:'layer',frameSource:'layer',frame:1,semantic:'highlight',patch:{x:0,y:0,rows:['h'],palette:{h:mark}}},
      {id:'source-cutout',target:'gear',space:'layer',frameSource:'layer',frame:1,patch:{x:-1,y:0,rows:['x'],palette:{x:null}}},
    ],maskEdits:[{id:'source-negative-space',name:'negativeSpace',target:'gear',space:'layer',frameSource:'layer',frame:1,x:-1,y:0,rows:['+']}],
  };
  const asset=parseCharacterAsset2D(serializeCharacterAsset2D(createCharacterAsset2D(base))),player=createCharacterPlayer2D(asset);
  const times=[.15,.25,.55,.65,.15];
  for(const time of times){
    const sample=player.sample(time,'play',{x:.2,y:.4}),frame=sample.layerFrames.gear,m=layerMatrix(sample,asset),native=new Uint32Array(9).fill(frame===0?colorA:colorB);
    if(frame===1){native[4]=mark;native[3]=0;}
    const source=raster(3,3,native,-1,-1),out=sample.actor;
    for(let yy=0;yy<out.h;yy++)for(let xx=0;xx<out.w;xx++){
      const i=yy*out.w+xx,j=nativeIndex(source,m,out.x+xx+.5,out.y+yy+.5);
      assert.equal(out.pixels[i],j<0?0:native[j]);
      assert.equal(sample.semanticMasks.highlight?.[i]??0,frame===1&&j===4?1:0);
      assert.equal(sample.semanticMasks.negativeSpace?.[i]??0,frame===1&&j===3?1:0);
      almost(sample.emission[i*3],j<0||frame===1&&j===3?0:frame===0?.5:.75);
    }
  }
  assert.deepEqual(base.celEdits[0].patch.rows,['h']);assert.deepEqual(base.layers[0].clip.frames[1].runs,[9,colorB]);
  assert.throws(()=>createCharacterAsset2D({...asset,celEdits:[{...asset.celEdits[0],frameSource:'export'}]}),/reference/);
  assert.throws(()=>createCharacterAsset2D({...asset,celEdits:[{...asset.celEdits[0],target:'body'}]}),/raster layer/);
});

test('legacy actor-local/socket patches retain their coordinate meanings after fractional placement',()=>{
  const {asset}=sourceAsset({width:20,height:20,pivot:[10,10],pixels:new Uint32Array(400).fill(colorA),grip:{x:4.2,y:1.6,angle:.4},offset:[0,0],angle:0});
  const edits=[
    {id:'actor-mark',target:'gear',space:'local',frame:0,patch:{x:2,y:3,rows:['aa'],palette:{a:colorB}}},
    {id:'socket-mark',target:'gear',space:'socket',socket:'grip',frame:0,patch:{x:0,y:0,rows:['ss'],palette:{s:mark}}},
  ];
  const baseline=createCharacterPlayer2D(asset).sample(.2,'play',{x:.4,y:-.3});
  const sample=createCharacterPlayer2D({...asset,celEdits:edits}).sample(.2,'play',{x:.4,y:-.3}),out=sample.actor,grip=socketTransform2D(sample.sockets.grip);
  let actorMarks=0,socketMarks=0;
  for(let yy=0;yy<out.h;yy++)for(let xx=0;xx<out.w;xx++){
    const i=yy*out.w+xx,wx=out.x+xx+.5,wy=out.y+yy+.5,ax=wx-.4,ay=wy+.3,[sx,sy]=sourcePoint(grip,wx,wy);
    let expected=baseline.actor.pixels[i];
    if(Math.floor(ay-3)===0&&Math.floor(ax-2)>=0&&Math.floor(ax-2)<2){expected=colorB;actorMarks++;}
    if(Math.floor(sy)===0&&Math.floor(sx)>=0&&Math.floor(sx)<2){expected=mark;socketMarks++;}
    assert.equal(out.pixels[i],expected);
  }
  assert.ok(actorMarks>0&&socketMarks>0);
});

test('deferred painting preserves the socket definition that was visible to each layer',()=>{
  for(const target of ['body','early']){
    const clip={version:1,width:8,height:4,pivot:[0,0],frames:[{durationMs:800,runs:[32,colorA]}]};
    const source={...clip,frames:[{...clip.frames[0],runs:[32,target==='body'?colorA:0],sockets:{grip:{x:1,y:1}}}]};
    const asset=createCharacterAsset2D({schema:'poku.character/v1',id:'socket-scope-study',name:'Socket scope study',nativeHeight:16,defaultClip:'play',
      source:{kind:'sprite',clip:source},clips:{play:{kind:'sprite',options:{loop:true}}},
      layers:[...(target==='early'?[{id:'early',clip,semantic:'cloth'}]:[]),
        {id:'late',semantic:'publisher',clip:{version:1,width:1,height:1,pivot:[0,0],frames:[{durationMs:800,runs:[1,0],sockets:{grip:{x:5,y:1}}}]}}],
      celEdits:[{id:'unchanged-socket-mark',target,space:'socket',socket:'grip',patch:{x:0,y:0,rows:['x'],palette:{x:mark}}}],
      maskEdits:[{id:'unchanged-socket-selection',name:'detail',target,space:'socket',socket:'grip',x:0,y:0,rows:['+']}],
    });
    const sample=createCharacterPlayer2D(asset).sample(.1,'play',{x:.2,y:.3}),out=sample.actor;
    const at=(x,y)=>(y-out.y)*out.w+x-out.x;
    almost(sample.sockets.grip.position[0],5.2);
    assert.equal(out.pixels[at(1,1)],mark);assert.equal(out.pixels[at(5,1)],colorA);
    assert.equal(sample.semanticMasks.detail[at(1,1)],1);assert.equal(sample.semanticMasks.detail[at(5,1)],0);
  }
});

test('released arrows compose release correction with final placement before rasterization',()=>{
  const asset=createStudioCharacter2D({height:32,view:'side'}),base=createCharacterPlayer2D(asset);
  let edited=setCharacterSocketKey2D(asset,'bow','hand.grip',{at:0,position:[3.4,-1.3],angle:.37});
  edited=setCharacterSocketKey2D(edited,'bow','hand.grip',{at:.8,position:[18,7],angle:1.1});
  const player=createCharacterPlayer2D(edited),before=base.sample(.7,'bow'),release=player.sample(.7,'bow');
  const correction=composePixelTransform2D(socketTransform2D(release.sockets['hand.grip']),invertPixelTransform2D(socketTransform2D(before.sockets['hand.grip']))),placement=pixelTransform2D(.4,-.35);
  for(const time of [.9,1.1]){
    const raw=base.sample(time,'bow').projectiles[0],expected=transformSprite2D(raw,composePixelTransform2D(placement,correction));
    const actual=player.sample(time,'bow',{x:.4,y:-.35}).projectiles[0];
    assert.deepEqual(actual,expected);
  }
});
