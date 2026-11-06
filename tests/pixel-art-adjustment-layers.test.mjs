import test from 'node:test';
import assert from 'node:assert/strict';
import { createPixelArtDocument2D, renderPixelArtDocument2D, serializePixelArtDocument2D, parsePixelArtDocument2D,
  flattenPixelArtDocument2D, renderPixelArtAuthoredHeight2D, PixelArtDocumentHistory2D } from '../build/authoring/pixel-art-document.js';

const rgba = (r,g,b,a=255) => (r|g<<8|b<<16|a<<24)>>>0;
function fixture() {
  const w=4,h=3,n=w*h,colors=Array.from({length:n},(_,i)=>rgba(10+i,60+i,110+i,i===0?1:255));
  const normal=new Float32Array(n*3);for(let i=0;i<n;i++)normal.set([.6,0,.8],i*3);
  return createPixelArtDocument2D({w,h,pixels:Uint32Array.from(colors),mask:{w,h,data:new Uint8Array(n).fill(1)},
    channels:{w,h,material:Uint16Array.from(colors,(_,i)=>i+1),height:Float32Array.from(colors,(_,i)=>i+1),normal}},'층과 색 보존');
}
const selection=(...indices)=>Array.from({length:12},(_,i)=>Number(indices.includes(i)));
const append=(doc,layer)=>({...doc,layers:[...doc.layers,layer],activeLayerId:layer.id});

test('transform replay preserves editable source, exact low-alpha colors and aligned material channels',()=>{
  const base=fixture(),before=structuredClone(base);
  const next=append(base,{kind:'transform',id:'move',name:'Native move',selection:selection(0,1),transform:{offset:[1,1]}});
  const out=renderPixelArtDocument2D(next),expected=base.pixels.slice();
  expected[5]=expected[0];expected[6]=expected[1];expected[0]=expected[1]=0;
  assert.deepEqual(Array.from(out.pixels),expected);assert.equal(out.channels.height[5],1);assert.equal(out.channels.material[6],2);
  assert.equal(out.mask.data[0],0);assert.equal(out.pixels[5]>>>24,1);assert.deepEqual(base,before);
  const opened=parsePixelArtDocument2D(serializePixelArtDocument2D(next));
  assert.deepEqual(renderPixelArtDocument2D(opened),out);
  assert.deepEqual(opened.pixels,base.pixels);
});

test('quarter-turn adjustment rotates normals and restores all channels through undo and redo',()=>{
  const base=fixture(),history=new PixelArtDocumentHistory2D(base),mask=selection(0,1,4,5);
  const next=append(base,{kind:'transform',id:'turn',name:'Clockwise',selection:mask,transform:{quarterTurns:1}});
  history.commit(next);const turned=renderPixelArtDocument2D(history.value);
  assert.deepEqual(Array.from(turned.channels.normal.slice(3,6)),[-0,Math.fround(.6),Math.fround(.8)]);
  assert.equal(turned.pixels[1],base.pixels[0]);
  assert.deepEqual(renderPixelArtDocument2D(history.undo()),renderPixelArtDocument2D(base));
  assert.deepEqual(renderPixelArtDocument2D(history.redo()),turned);
});

test('hiding or reordering a transform is nondestructive and changes only the replay order',()=>{
  const base=fixture(),paint={kind:'paint',id:'paint',name:'Accent',indices:[0],pixels:[rgba(230,80,50)]};
  const move={kind:'transform',id:'move',name:'Move',selection:selection(0),transform:{offset:[1,0]}};
  const moved=renderPixelArtDocument2D({...base,layers:[paint,move]});
  assert.equal(moved.pixels[1],paint.pixels[0]);assert.equal(moved.pixels[0],0);
  const reordered=renderPixelArtDocument2D({...base,layers:[move,paint]});
  assert.equal(reordered.pixels[0],paint.pixels[0]);assert.equal(reordered.pixels[1],base.pixels[0]);
  assert.deepEqual(renderPixelArtDocument2D({...base,layers:[{...move,visible:false}]}),renderPixelArtDocument2D(base));
});

test('transform masks and protected collisions fail atomically without changing lower layers',()=>{
  const base=fixture(),original=serializePixelArtDocument2D(base);
  const layer={kind:'transform',id:'protected',name:'Protected move',selection:selection(0),protectedMask:selection(1),transform:{offset:[1,0]}};
  assert.throws(()=>renderPixelArtDocument2D(append(base,layer)),/protected/i);
  assert.equal(serializePixelArtDocument2D(base),original);
  assert.throws(()=>parsePixelArtDocument2D(JSON.stringify(append(base,{...layer,selection:[1]}))),/Selection/);
  assert.throws(()=>parsePixelArtDocument2D(JSON.stringify(append(base,{...layer,transform:{offset:[.5,0]}}))),/integers/);
});

test('relight layers keep exact albedo under neutral light, independently from low alpha and protection',()=>{
  const base=fixture(),layer={kind:'relight',id:'light',name:'Neutral',lighting:{lights:[],ambient:1,specular:0,ambientOcclusion:0}};
  const neutral=append(base,layer);
  assert.deepEqual(renderPixelArtDocument2D(neutral),renderPixelArtDocument2D(base));
  const dimmed=append(base,{...layer,selection:selection(0,1),protectedMask:selection(1),lighting:{...layer.lighting,ambient:0}});
  const out=renderPixelArtDocument2D(dimmed);
  assert.equal(out.pixels[0],rgba(0,0,0,1));assert.equal(out.pixels[1],base.pixels[1]);
  assert.deepEqual(Array.from(out.pixels.slice(2)),base.pixels.slice(2));
  assert.deepEqual(out.channels,renderPixelArtDocument2D(base).channels);
});

test('colored relight serializes idempotently and repeated renders never compound its shading',()=>{
  const base=fixture(),next=append(base,{kind:'relight',id:'light',name:'Warm key',lighting:{lights:[{direction:[-.67,-.74,.8],color:'#ffe1b7',intensity:.7}],ambient:.2}});
  const json=serializePixelArtDocument2D(next),reopened=parsePixelArtDocument2D(json),rendered=renderPixelArtDocument2D(reopened);
  for(let i=0;i<5;i++)assert.equal(serializePixelArtDocument2D(parsePixelArtDocument2D(json)),json);
  assert.deepEqual(renderPixelArtDocument2D(reopened),rendered);assert.deepEqual(reopened.pixels,base.pixels);
  assert.deepEqual(renderPixelArtDocument2D(flattenPixelArtDocument2D(reopened)),rendered);
});

test('reopened geometry and lighting layers preserve the existing v2 document contract',()=>{
  const base=fixture(),next=append(append(base,{kind:'transform',id:'move',name:'Copy',selection:selection(0,1),transform:{copy:true,offset:[0,2]}}),
    {kind:'relight',id:'light',name:'Color-preserving light',lighting:{lights:[],ambient:.5,specular:0},protectedMask:selection(3)});
  const saved=serializePixelArtDocument2D(next),opened=parsePixelArtDocument2D(saved);
  assert.equal(opened.schema,'poku-pixel-art/v2');assert.deepEqual(opened.layers.map(x=>x.kind),['transform','relight']);
  assert.deepEqual(renderPixelArtDocument2D(opened),renderPixelArtDocument2D(next));assert.equal(opened.activeLayerId,'light');
});

test('working authored height follows visible transforms while keeping the saved original shape intact',()=>{
  const base=fixture();base.authoredHeight=Array.from({length:12},(_,i)=>i+.25);
  // Previously baked geometry and a procedural layer must not replace the raw form.
  base.channels.height.fill(99);
  const surface={kind:'material',id:'surface',name:'Procedural detail',material:{kind:'stone',seed:37,relief:4,bevel:2},height:base.authoredHeight};
  const move={kind:'transform',id:'move',name:'Move shape',selection:selection(0,1),transform:{offset:[1,1]}};
  const next={...base,layers:[surface,move]},snapshot=structuredClone(next),expected=base.authoredHeight.slice();
  expected[5]=expected[0];expected[6]=expected[1];expected[0]=expected[1]=0;
  assert.deepEqual(Array.from(renderPixelArtAuthoredHeight2D(next)),expected);
  assert.deepEqual(Array.from(renderPixelArtAuthoredHeight2D({...next,layers:[surface,{...move,visible:false}]})),base.authoredHeight);
  assert.deepEqual(next,snapshot);
  const first=renderPixelArtAuthoredHeight2D(next);first.fill(500);
  assert.deepEqual(Array.from(renderPixelArtAuthoredHeight2D(next)),expected,'returned working maps do not alias saved source arrays');
});

test('paint/transform reordering and visibility update form height with the same occupancy rules as color',()=>{
  const base=fixture();base.authoredHeight=Array.from({length:12},(_,i)=>i+1);
  const move={kind:'transform',id:'move',name:'Move',selection:selection(0),transform:{offset:[1,0]}};
  const erase={kind:'paint',id:'erase',name:'Erase source',indices:[0],pixels:[0]};
  const erasedBefore=renderPixelArtAuthoredHeight2D({...base,layers:[erase,move]});
  const erasedAfter=renderPixelArtAuthoredHeight2D({...base,layers:[move,erase]});
  assert.equal(erasedBefore[0],0);assert.equal(erasedBefore[1],0);
  assert.equal(erasedAfter[0],0);assert.equal(erasedAfter[1],1);
  assert.deepEqual(renderPixelArtAuthoredHeight2D({...base,layers:[{...erase,visible:false},move]}),erasedAfter);
  const newCell={...erase,id:'paint',name:'New cell',pixels:[rgba(240,200,100)]};
  const repainted={...base,layers:[move,newCell]};
  assert.equal(renderPixelArtAuthoredHeight2D(repainted)[0],0,'newly occupied cells get flat unassigned form height');
  assert.equal(renderPixelArtDocument2D(repainted).channels.height[0],0);
  const partlyErased={...base,layers:[{...erase,indices:[2],opacity:.5}]};
  assert.equal(renderPixelArtAuthoredHeight2D(partlyErased)[2],3,'partial erasure keeps geometry until coverage vanishes');
  assert.equal(renderPixelArtDocument2D(partlyErased).channels.height[2],3);
});

test('a later material receives the visible working shape after hiding or reordering geometry edits',()=>{
  const base=fixture();base.authoredHeight=Array.from({length:12},(_,i)=>i+1);
  const move={kind:'transform',id:'move',name:'Shift',selection:selection(0),transform:{offset:[1,0]}};
  const erase={kind:'paint',id:'erase',name:'Remove',indices:[0],pixels:[0]};
  const cases=[{layers:[move],at:1,value:1},{layers:[{...move,visible:false}],at:1,value:2},
    {layers:[erase,move],at:1,value:0},{layers:[move,erase],at:1,value:1}];
  for(const {layers,at,value} of cases){
    const current={...base,layers},height=renderPixelArtAuthoredHeight2D(current);
    const material={kind:'material',id:'new-surface',name:'Next material',material:{kind:'metal',detail:0,relief:0,bevel:0},height:Array.from(height)};
    const result=renderPixelArtDocument2D({...current,layers:[...layers,material]});
    assert.equal(result.channels.height[at],value);
  }
});

test('flatten bakes the derived authored height once and save/reopen never applies removed transforms again',()=>{
  const base=fixture();base.authoredHeight=Array.from({length:12},(_,i)=>i+.5);
  const move={kind:'transform',id:'move',name:'Move form',selection:selection(0,1),transform:{offset:[1,1]}};
  const source={...base,layers:[move]},expected=Array.from(renderPixelArtAuthoredHeight2D(source));
  const flat=flattenPixelArtDocument2D(source),reopened=parsePixelArtDocument2D(serializePixelArtDocument2D(flat));
  assert.equal(flat.layers.length,0);assert.deepEqual(flat.authoredHeight,expected);
  assert.deepEqual(Array.from(renderPixelArtAuthoredHeight2D(reopened)),expected);
  assert.deepEqual(renderPixelArtDocument2D(reopened),renderPixelArtDocument2D(source));
  assert.deepEqual(flattenPixelArtDocument2D({...source,layers:[{...move,visible:false}]}).authoredHeight,base.authoredHeight);
  assert.equal(renderPixelArtAuthoredHeight2D(fixture()),undefined,'a source map is never inferred from baked channels or RGB');
});
