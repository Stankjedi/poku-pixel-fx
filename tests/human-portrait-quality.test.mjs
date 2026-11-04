import test from'node:test';import assert from'node:assert/strict';
import{renderHumanPortrait2D,drawHumanPortrait2D,createFrame,Painter,hex}from'../build/core/index.js';
const sizes=[64,96,128,192],hairs=['long','bob','ponytail','braid'],expressions=['neutral','smile','determined','surprised'];
function components(data,w,h){const seen=new Set(),groups=[];for(let start=0;start<data.length;start++){if(!data[start]||seen.has(start))continue;const group=[],stack=[start];seen.add(start);while(stack.length){const i=stack.pop();group.push(i);const x=i%w,y=Math.floor(i/w);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){const xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>=0&&yy>=0&&xx<w&&yy<h&&data[j]&&!seen.has(j)){seen.add(j);stack.push(j);}}}groups.push(group);}return groups;}
test('native portrait sizes are deterministic, bounded and have one connected body silhouette',()=>{
 for(const resolution of sizes)for(const hair of hairs)for(const expression of expressions){const style={resolution,hair},pose={expression,time:.4},a=renderHumanPortrait2D(style,pose);assert.equal(a.w,resolution);assert.equal(a.h,resolution);assert.deepEqual(a,renderHumanPortrait2D(style,pose));assert.equal(components(a.mask.data,a.w,a.h).length,1);for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++){const i=y*a.w+x;assert.equal(a.mask.data[i],a.pixels[i]?1:0);if(a.pixels[i]){assert(x>0&&y>0&&x<a.w-1&&y<a.h-1);assert.equal(a.pixels[i]>>>24,255);}}}
});
test('semantic eyes stay inside face, clear of bangs and separated under every expression/gaze',()=>{
 for(const resolution of sizes)for(const hair of hairs)for(const expression of expressions)for(const gaze of[-1,0,1])for(const blink of[false,true]){const a=renderHumanPortrait2D({resolution,hair},{expression,gaze,blink});assert.equal(components(a.eyeMask,a.w,a.h).length,2,`${resolution}/${hair}/${expression}/${gaze}/${blink}`);for(let i=0;i<a.pixels.length;i++){if(a.eyeMask[i]){assert(a.faceMask[i]);assert(a.eyeRegionMask[i]);assert(!a.frontHairMask[i]);assert(a.pixels[i]);}assert(!(a.eyeRegionMask[i]&&a.frontHairMask[i]));}}
});
test('closed lids remove eye whites and irises, without repainting skin outside the eye region',()=>{
 const lid=hex('#403447')>>>0;for(const resolution of sizes)for(const hair of hairs)for(const expression of expressions){const a=renderHumanPortrait2D({resolution,hair},{expression,blink:true});assert(a.blink);for(let i=0;i<a.eyeMask.length;i++)if(a.eyeMask[i])assert.equal(a.pixels[i],lid);}
});
test('target resolution and canvas padding are independent, preserving a shared source-pixel grid',()=>{
 for(const resolution of sizes){const a=renderHumanPortrait2D({resolution},{time:.6}),b=renderHumanPortrait2D({resolution,canvas:[resolution+64,resolution+80]},{time:.6});assert.deepEqual(b.headAnchor,[a.headAnchor[0]+32,a.headAnchor[1]+40]);for(const key of['pixels','faceMask','eyeRegionMask','eyeMask','frontHairMask']){for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++)assert.equal(a[key][y*a.w+x],b[key][(y+40)*b.w+x+32]);assert.equal(Array.from(a[key]).filter(Boolean).length,Array.from(b[key]).filter(Boolean).length);}}
});
test('larger resolutions are natively repainted, not nearest-neighbor 64px sprites',()=>{
 const a=renderHumanPortrait2D({resolution:64}),b=renderHumanPortrait2D({resolution:128});let different=0;for(let y=0;y<128;y++)for(let x=0;x<128;x++)different+=b.pixels[y*128+x]!==a.pixels[Math.floor(y/2)*64+Math.floor(x/2)];assert(different>200);assert.equal(a.detailTier,'compact');assert.equal(b.detailTier,'standard');assert.equal(renderHumanPortrait2D({resolution:192}).detailTier,'rich');
});
test('entire artwork, semantic masks and head/eye anchors reflect together',()=>{
 for(const resolution of sizes)for(const hair of hairs){const a=renderHumanPortrait2D({resolution,hair},{expression:'smile',gaze:1,time:.7}),b=renderHumanPortrait2D({resolution,hair,facing:'left'},{expression:'smile',gaze:1,time:.7});for(const key of['pixels','faceMask','eyeRegionMask','eyeMask','frontHairMask'])for(let y=0;y<a.h;y++)for(let x=0;x<a.w;x++)assert.equal(a[key][y*a.w+x],b[key][y*a.w+a.w-1-x]);assert.deepEqual(b.headAnchor,[a.w-1-a.headAnchor[0],a.headAnchor[1]]);assert.deepEqual(b.eyeAnchors,a.eyeAnchors.map(([x,y])=>[a.w-1-x,y]));}
});
test('outline follows only the outside union and never recolors a material or face',()=>{
 const ink=hex('#ff00ff')>>>0;for(const resolution of sizes)for(const hair of hairs){const a=renderHumanPortrait2D({resolution,hair,outline:null}),b=renderHumanPortrait2D({resolution,hair,outline:'#ff00ff'});for(let i=0;i<a.pixels.length;i++){if(a.pixels[i])assert.equal(a.pixels[i],b.pixels[i]);else if(b.pixels[i]){assert.equal(b.pixels[i],ink);assert(a.pixels[i-1]||a.pixels[i+1]||a.pixels[i-a.w]||a.pixels[i+a.w]);}}}
});
test('one snapped head anchor carries face and eyes through exact seekable idle loops',()=>{
 for(const resolution of sizes){const a=renderHumanPortrait2D({resolution},{time:0,blink:false});for(const t of[.2,.7,1,1.4,1.8,2]){const b=renderHumanPortrait2D({resolution},{time:t,blink:false}),c=renderHumanPortrait2D({resolution},{time:t+2,blink:false});assert.deepEqual(b,c);const dy=b.headAnchor[1]-a.headAnchor[1];for(const key of['faceMask','eyeRegionMask','eyeMask'])for(let y=2;y<a.h-2;y++)for(let x=0;x<a.w;x++)assert.equal(a[key][y*a.w+x],b[key][(y+dy)*b.w+x]);}}
});
test('reduced motion freezes head, hair and automatic blink while explicit blink still works',()=>{
 for(const resolution of sizes){const a=renderHumanPortrait2D({resolution},{time:0,reducedMotion:true});assert.deepEqual(a,renderHumanPortrait2D({resolution},{time:1.6,reducedMotion:true}));assert.equal(a.blink,false);assert.equal(renderHumanPortrait2D({resolution},{blink:true,reducedMotion:true}).blink,true);assert.equal(renderHumanPortrait2D({resolution},{time:1.6}).blink,true);}
});
test('draw helper preserves Painter placement and the shared pixel grid',()=>{
 const a=renderHumanPortrait2D({resolution:64}),f=createFrame(180,150);const b=drawHumanPortrait2D(new Painter(f).place(40,30),{resolution:64});assert.deepEqual(a,b);for(let y=0;y<64;y++)for(let x=0;x<64;x++)assert.equal(a.pixels[y*64+x],f.color[(y+30)*180+x+40]);
});
test('invalid resolutions, canvases, variants, times and flags fail clearly',()=>{
 for(const resolution of[32,65,256,NaN,Infinity])assert.throws(()=>renderHumanPortrait2D({resolution}));for(const canvas of[[64],[],[63,64],[64,513],[65.2,64],[NaN,64],'128'])assert.throws(()=>renderHumanPortrait2D({resolution:64,canvas}));for(const style of[{hair:'wig'},{face:'round'},{skin:'green'},{clothing:'armor'},{facing:'up'},{eyes:'laser'},{outline:'black'}])assert.throws(()=>renderHumanPortrait2D(style));for(const pose of[{expression:'sad'},{time:NaN},{time:Infinity},{gaze:NaN},{blink:1},{reducedMotion:'yes'}])assert.throws(()=>renderHumanPortrait2D({},pose));
});
test('material fill has no isolated fragments or tiny enclosed background pinholes',()=>{
 function groups(data,w,h){const seen=new Uint8Array(data.length),out=[];for(let first=0;first<data.length;first++){if(!data[first]||seen[first])continue;const q=[first];seen[first]=1;for(let k=0;k<q.length;k++){const i=q[k],x=i%w,y=Math.floor(i/w);for(const[xx,yy]of[[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){const j=yy*w+xx;if(xx>=0&&yy>=0&&xx<w&&yy<h&&data[j]&&!seen[j]){seen[j]=1;q.push(j);}}}out.push(q);}return out;}
 for(const resolution of sizes)for(const hair of hairs)for(const face of['oval','angular','long']){const a=renderHumanPortrait2D({resolution,hair,face,outline:null});assert.equal(groups(a.mask.data,a.w,a.h).length,1);const holes=groups(Uint8Array.from(a.mask.data,v=>!v),a.w,a.h).filter(g=>!g.includes(0));for(const hole of holes)assert(hole.length>8,`${resolution}/${hair}/${face}: ${hole.length}px pinhole`);if(hair!=='ponytail')assert.equal(holes.length,0);else assert(holes.length<=1,'One deliberate negative space between tied hair and neck');}
});
