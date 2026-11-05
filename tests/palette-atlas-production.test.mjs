import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createOrderedPaletteQuantizer2D} from '../build/core/pixel-quantize.js';
import {renderIndexedSprite2D} from '../build/core/pixel-tools.js';
import {createPixelStyleProfile2D,compilePixelStyle2D} from '../build/core/pixel-style.js';
import {resolveAtlasExportSettings,extrudeAtlasRegion} from '../build/render/export.js';
import {createAssetBundle} from '../build-tools/tools/lib/asset-bundle.mjs';
import {decodePNG} from '../build-tools/tools/lib/png-read.mjs';

const sprite=(color=0x80bcbcbc)=>({w:8,h:8,pixels:new Uint32Array(64).fill(color),mask:{w:8,h:8,data:new Uint8Array(64).fill(1)}});
test('ordered color dithering retains alpha and palette while approximating linear-light luminance',()=>{
  const source=sprite(),before=source.pixels.slice(),q=createOrderedPaletteQuantizer2D([0xff000000,0xffffffff]);
  for(const pattern of ['bayer2','bayer4','dispersed8','cluster4']){
    const indexed=q.index(source,{anchor:'object',pattern}),out=renderIndexedSprite2D(indexed);
    assert.equal(indexed.indices.reduce((n,i)=>n+i,0),32,pattern+' balances about half linear-light white');
    assert.ok(out.pixels.every(c=>c===0x80000000||c===0x80ffffff));
    assert.deepEqual(q.index(source,{anchor:'object',pattern}).indices,indexed.indices,'repeat is temporally stable');
  }
  assert.deepEqual(source.pixels,before,'authoring operation leaves input intact');
  assert.ok(createOrderedPaletteQuantizer2D([0xff000000,0xffffffff],0).index(source).indices.every(i=>i===1),'zero strength disables patterning');
});
test('color patterns use object/world coordinates and keep exact palette cells intact',()=>{
  const q=createOrderedPaletteQuantizer2D([0xff000000,0xffffffff]),source=sprite();
  const object=q.index(source,{anchor:'object'}),translated=q.index(source,{anchor:'world'},{objectToWorld:[1,0,0,1,1,0]});
  assert.notDeepEqual(translated.indices,object.indices);
  for(let y=0;y<8;y++)for(let x=0;x<7;x++)assert.equal(translated.indices[y*8+x],object.indices[y*8+x+1]);
  assert.ok(q.index(sprite(0x40ffffff)).indices.every(i=>i===1));
  assert.ok(q.index(sprite(0xff000000)).indices.every(i=>i===0));
  source.mask.data[0]=0;assert.equal(q.index(source).alpha[0],0);
  assert.throws(()=>createOrderedPaletteQuantizer2D([0xff000000,0x80000000]),/unique/);
});
test('saved pixel profiles apply independent color and alpha dither policies',()=>{
  const profile=createPixelStyleProfile2D({surfaceColors:'indexed',palette:[0xff000000,0xffffffff],quantization:'ordered',colorDitherStrength:1,alpha:'coverage',dither:{anchor:'object',pattern:'cluster4'}});
  const source=sprite(),out=compilePixelStyle2D(JSON.parse(JSON.stringify(profile))).apply(source,1);
  assert.ok(out.pixels.every(c=>c>>>24===128));
  assert.ok(out.pixels.some(c=>(c&0xffffff)===0)&&out.pixels.some(c=>(c&0xffffff)===0xffffff));
  const alpha=compilePixelStyle2D({...profile,alpha:'authored-dither'}).apply(source,1);
  assert.equal(alpha.pixels.filter(c=>c>>>24).length,32);
  assert.equal(alpha.pixels.filter(c=>c===0xff000000).length,16,'coverage must not select only the dark half of the color pattern');
  assert.equal(alpha.pixels.filter(c=>c===0xffffffff).length,16);
  assert.throws(()=>createPixelStyleProfile2D({...profile,colorDitherStrength:2}),/strength/);
});
test('atlas extrusion stays in padding and duplicates preserve timing/pivots/hidden RGB/HDR',()=>{
  const dir=mkdtempSync(join(tmpdir(),'poku-atlas-edges-'));
  try{
    const info={w:4,h:2,n:2,fps:10,pivot:[1.5,1]},fx={id:'test/edges',file:'',meta:{duration:.2,loop:false,origin:[1.5,1]},mod:{}};
    const sink=createAssetBundle(join(dir,'edges'),fx,info,{maxTextureSize:8,padding:2,extrude:2,trim:true,deduplicate:true});
    for(let i=0;i<2;i++){
      const color=new Uint8ClampedArray(32),emission=new Float32Array(24);color.set([7,8,9,0,90,30,20,128],i*4);emission.set([2,4,8,1,3,7],i*3);
      sink.push({t:i/10,durationMs:i?140:60,color,clear:color,layers:{color,emission},sockets:{grip:{x:1+i,y:1}}},i);
    }
    const result=sink.finish(),m=result.manifest;assert.equal(m.pages.length,1);assert.equal(m.durationMs,200);
    assert.deepEqual(m.frames[0].rect,m.frames[1].rect);assert.notDeepEqual(m.frames[0].trimOffset,m.frames[1].trimOffset);
    assert.deepEqual(m.frames.map(f=>f.duration),[60,140]);assert.deepEqual(m.frames.map(f=>f.sockets.grip.x),[1,2]);
    assert.equal(m.settings.atlas.extrude,2);
    const p=m.pages[0],rgba=decodePNG(readFileSync(join(dir,p.image))).rgba,hdr=readFileSync(join(dir,p.emission.image)),r=m.frames[0].rect;
    for(let y=0;y<p.height;y++)for(let x=0;x<p.width;x++){
      const right=x>=r.x+r.w-1,index=y*p.width+x;
      assert.deepEqual([...rgba.subarray(index*4,index*4+4)],right?[90,30,20,128]:[7,8,9,0]);
      assert.equal(hdr.readFloatLE(index*12),right?1:2);
    }
  }finally{rmSync(dir,{recursive:true,force:true});}
});
test('invalid extrusion is rejected before writes; zero extrusion preserves the page',()=>{
  assert.throws(()=>resolveAtlasExportSettings({padding:1,extrude:2}),/padding/);
  const page=Uint8Array.from({length:64},(_,i)=>i),before=page.slice();extrudeAtlasRegion(page,4,4,{x:1,y:1,w:2,h:2},0);assert.deepEqual(page,before);
  assert.throws(()=>extrudeAtlasRegion(page,4,4,{x:0,y:0,w:2,h:2},1),/region/);
});
