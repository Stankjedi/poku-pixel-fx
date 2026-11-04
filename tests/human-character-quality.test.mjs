import test from'node:test';import assert from'node:assert/strict';import{createHash}from'node:crypto';
import{renderHuman2D,humanRig2D,humanViewMotion2D,humanAction2D,hex}from'../build/core/index.js';
const views=['front','three-quarter','side','back'],sizes=[32,48,72],motions=['idle','walk','wave','guard','crouch','run','jump'];
const poseFor=(view,motion,t,style)=>['run','jump'].includes(motion)?humanAction2D(motion,t,{...style,view}).pose:humanViewMotion2D(view,motion,t);
const appearances=[
 {faceShape:'round',hair:'ponytail',outfit:'sweater'},
 {faceShape:'square',hair:'shaved',outfit:'overalls',facialHair:'beard'},
 {faceShape:'long',hair:'parted',outfit:'overalls'},
 {faceShape:'round',hair:'curls',outfit:'sweater'},
 {faceShape:'square',hair:'parted',outfit:'sweater',facialHair:'beard'},
 {faceShape:'long',hair:'ponytail',outfit:'sleeveless'},
];
function connected(sp){const n=sp.pixels.findIndex(Boolean),seen=new Set([n]),q=[n];while(q.length){const i=q.pop(),x=i%sp.w,y=Math.floor(i/sp.w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,k=yy*sp.w+xx;if(xx>=0&&yy>=0&&xx<sp.w&&yy<sp.h&&sp.pixels[k]&&!seen.has(k)){seen.add(k);q.push(k);}}}return seen.size===sp.mask.data.reduce((a,b)=>a+b,0);}
function pixelMap(sp){const out=new Map();for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++)if(sp.pixels[y*sp.w+x])out.set(`${x+sp.x},${y+sp.y}`,sp.pixels[y*sp.w+x]);return out;}
test('all legacy hair/outfit/view/facing/size/motion combinations retain their pixels',()=>{
 const h=createHash('sha256');for(const view of views)for(const facing of['left','right'])for(const height of sizes)for(const hair of['crop','bob','curls','swept','bun'])for(const outfit of['shirt','tunic','jacket','sleeveless'])for(const motion of motions){
  const style={view,facing,height,hair,outfit,skin:'brown',hairColor:'chestnut'},sp=renderHuman2D(style,poseFor(view,motion,.3,style));h.update(JSON.stringify([sp.w,sp.h,sp.x,sp.y]));h.update(new Uint8Array(sp.pixels.buffer));
 }
 assert.equal(h.digest('hex'),'2807bf360a025f42afa6b525e0367756721a6be2ef29db7ffa7b1b2524b54955');
});
test('explicit oval and no beard are exact default aliases',()=>{for(const view of views)for(const height of sizes){const style={view,height},pose=humanViewMotion2D(view,'idle',.5);assert.deepEqual(renderHuman2D(style,pose),renderHuman2D({...style,faceShape:'oval',facialHair:'none'},pose));}});
test('appearance options do not alter skeleton, contact or motion targets',()=>{
 for(const appearance of appearances)for(const view of views)for(const height of sizes)for(const build of['regular','slender','broad'])for(const motion of motions){
  const basic={view,height,build},style={...basic,...appearance},pose=poseFor(view,motion,.3,style);assert.deepEqual(humanRig2D(style,pose),humanRig2D(basic,pose));
  if(['run','jump'].includes(motion))assert.deepEqual(humanAction2D(motion,.3,style),humanAction2D(motion,.3,basic));
 }
});
test('new appearance silhouettes stay connected, padded, opaque and mask-aligned',()=>{
 for(const appearance of appearances)for(const view of views)for(const height of sizes)for(const motion of motions)for(const t of[0,.3,.55,.9]){
  const style={...appearance,view,height,outline:null},sp=renderHuman2D(style,poseFor(view,motion,t,style));assert(connected(sp),JSON.stringify({appearance,view,height,motion,t}));
  for(let y=0;y<sp.h;y++)for(let x=0;x<sp.w;x++){const i=y*sp.w+x;assert.equal(sp.mask.data[i],sp.pixels[i]?1:0);if(sp.pixels[i]){assert.equal(sp.pixels[i]>>>24,255);assert(x>1&&y>1&&x<sp.w-2&&y<sp.h-2);}}
 }
});
test('appearance interiors keep their material colors when the union contour is added',()=>{
 const ink=hex('#ff00ff')>>>0;for(const appearance of appearances)for(const view of views)for(const height of sizes){const style={...appearance,view,height},pose=humanViewMotion2D(view,'guard',.3),a=renderHuman2D({...style,outline:null},pose),b=renderHuman2D({...style,outline:'#ff00ff'},pose);
  assert.deepEqual([a.w,a.h,a.x,a.y],[b.w,b.h,b.x,b.y]);for(let i=0;i<a.pixels.length;i++){if(a.pixels[i])assert.equal(a.pixels[i],b.pixels[i]);else if(b.pixels[i]){assert.equal(b.pixels[i],ink);assert(a.pixels[i-1]||a.pixels[i+1]||a.pixels[i-a.w]||a.pixels[i+a.w]);}}
 }
});
test('new hair, face and garment choices change drawn shapes, not only color labels',()=>{
 for(const view of views)for(const height of[48,72]){
  const pose=humanViewMotion2D(view,'idle',0),base={view,height,outline:null,skin:'brown'},hash=(s)=>createHash('sha256').update(JSON.stringify([...pixelMap(renderHuman2D({...base,...s},pose))])).digest('hex');
  assert.equal(new Set(['oval','round','square','long'].map(faceShape=>hash({faceShape,hair:'shaved'}))).size,4);
  assert.equal(new Set(['shaved','ponytail','parted'].map(hair=>hash({hair}))).size,3);
  assert.equal(new Set(['shirt','sweater','overalls'].map(outfit=>hash({outfit}))).size,3);
 }
});
test('new appearance shapes leave intended eye pixels readable and back views contain no face marks',()=>{
 const eye=hex('#3b3038')>>>0;for(const view of views)for(const height of sizes)for(const faceShape of['oval','round','square','long'])for(const hair of['shaved','ponytail','parted','crop','bob','curls','swept','bun'])for(const facialHair of['none','beard']){
  if(faceShape==='oval'&&facialHair==='none'&&!['shaved','ponytail','parted'].includes(hair))continue; // Legacy pixels have their own compatibility test.
  const sp=renderHuman2D({view,height,faceShape,hair,facialHair,outline:null}),count=sp.pixels.reduce((n,c)=>n+(c===eye),0);
  assert.equal(count,view==='back'?0:view==='front'||(view==='three-quarter'&&height>=48)?2:1,JSON.stringify({view,height,faceShape,hair,facialHair}));
  if(view==='back')assert.deepEqual(sp,renderHuman2D({view,height,faceShape,hair,facialHair:'none',outline:null}));
 }
});
test('appearances are deterministic and reflect complete pixels and masks',()=>{
 for(const appearance of appearances)for(const view of views)for(const height of sizes){const style={...appearance,view,height},pose=poseFor(view,'run',.3,style),a=renderHuman2D(style,pose),b=renderHuman2D({...style,facing:'left'},pose);
  assert.deepEqual(a,renderHuman2D(style,pose));assert.equal(b.x,-a.x-a.w);for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){assert.equal(a.pixels[y*a.w+x],b.pixels[y*a.w+a.w-1-x]);assert.equal(a.mask.data[y*a.w+x],b.mask.data[y*a.w+a.w-1-x]);}
 }
});
test('invalid new appearance enums fail consistently through rig, render and action APIs',()=>{
 for(const style of[{faceShape:'triangle'},{faceShape:null},{facialHair:'unknown'},{facialHair:true},{hair:'long-long'},{outfit:'poncho'}])for(const facing of['left','right']){
  assert.throws(()=>humanRig2D({...style,facing}));assert.throws(()=>renderHuman2D({...style,facing}));assert.throws(()=>humanAction2D('run',0,{...style,facing}));
 }
});

test('new appearance pupil and blink cells survive fractional idle/guard placement and gaze',()=>{
 const offset=(shape,x,y)=>{if(shape==='round'){x*=1.18;y*=.92;}else if(shape==='long'){x*=.9;y*=1.14;}else if(shape==='square')x*=1.12;return[x,y];};
 for(const appearance of appearances)for(const view of views.slice(0,3))for(const height of sizes)for(const base of[{},humanViewMotion2D(view,'idle',.55),humanViewMotion2D(view,'guard',.5)])for(const gaze of[-1,0,1])for(const blink of[false,true]){
  const sp=renderHuman2D({...appearance,view,height,outline:null},{...base,gaze,blink}),r=sp.rig,c=hex(blink?'#985d49':'#3b3038')>>>0;
  const eyes=view==='front'?[[-2.8+gaze,.2],[2.6+gaze,.2]]:view==='side'?[[3.2+.5*gaze,-.5]]:height>=48?[[-.5+.6*gaze,.2],[3.6+.3*gaze,.2]]:[[-.5+.6*gaze,.2]];
  for(const[x,y]of eyes){const[dx,dy]=offset(appearance.faceShape,x,y),xx=Math.round(r.head[0]+dx*r.scale)-sp.x,yy=Math.round(r.head[1]+dy*r.scale)-sp.y;assert.equal(sp.pixels[yy*sp.w+xx],c,JSON.stringify({appearance,view,height,gaze,blink,base}));}
 }
});
