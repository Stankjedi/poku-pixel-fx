import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fractureStone, rubblePath, createFrame, createFx } from '../build/core/index.js';
import * as rock from '../build/fx/nature/rock-fracture.js';

const polygon = [[-27,0],[-32,-12],[-24,-34],[-10,-44],[15,-41],[29,-23],[27,-4],[17,0]];
const near = (a,b,e=1e-7) => assert.ok(Math.abs(a-b)<e,`${a} != ${b}`);
const area = p => Math.abs(p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1]},0)/2);
const inside = (p,x,y) => p.every((a,i)=>{const b=p[(i+1)%p.length];return (b[0]-a[0])*(y-a[1])-(b[1]-a[1])*(x-a[0])>=-1e-8});

test('fitted fracture preserves source area, coverage, input, winding and compact blocks',()=>{
  const original=structuredClone(polygon);
  for(const seed of [1,7,17,29]) {
    const cells=fractureStone(polygon,{pieces:16,minArea:27,seed});
    assert.equal(cells.length,16); near(cells.reduce((s,c)=>s+c.area,0),area(polygon));
    for(const c of cells){
      assert.ok(c.area>=27); near(c.area,area(c.polygon)); assert.ok(inside(c.polygon,...c.center));
      let perimeter=0;
      for(let i=0;i<c.polygon.length;i++){
        const a=c.polygon[i],b=c.polygon[(i+1)%c.polygon.length];assert.ok(inside(polygon,...a));perimeter+=Math.hypot(b[0]-a[0],b[1]-a[1]);
      }
      assert.ok(c.area/(perimeter*perimeter)>.025,'blocks do not become needle-like slivers');
    }
    // Off-grid samples avoid coinciding with fracture boundaries.
    for(let y=-44.317;y<1;y+=1.123) for(let x=-32.419;x<30;x+=1.173){
      const coverage=cells.filter(c=>inside(c.polygon,x,y)).length;
      assert.equal(coverage,inside(polygon,x,y)?1:0,'no overlapping or missing material');
    }
    assert.deepEqual(cells,fractureStone([...polygon].reverse(),{pieces:16,minArea:27,seed}));
  }
  assert.deepEqual(polygon,original);
});
test('fracture is seeded, honors lower bounds, and rejects invalid silhouettes/options',()=>{
  assert.deepEqual(fractureStone(polygon),fractureStone(polygon));
  assert.notDeepEqual(fractureStone(polygon),fractureStone(polygon,{seed:2}));
  assert.equal(fractureStone(polygon,{minArea:area(polygon)}).length,1);
  for(const p of [[],[[0,0],[1,0],[2,0]],[[0,0],[2,0],[1,1],[2,2],[0,2]],[[0,0],[1,1],[0,1],[1,0]],[[0,0],[0,0],[1,1]],[[0,0],[Infinity,1],[1,0]]])
    assert.throws(()=>fractureStone(p),RangeError);
  for(const options of [{pieces:0},{pieces:1.4},{pieces:257},{minArea:0},{minArea:NaN},{seed:Infinity}])assert.throws(()=>fractureStone(polygon,options),RangeError);
});
test('rotating rubble never penetrates ground, records impact energy, loses motion and rests',()=>{
  const shape=[[-9,-3],[7,-4],[8,5],[-8,4]], launch={x:0,y:-32,vx:43,vy:-130,spin:4};
  const path=rubblePath(shape,launch,{duration:3});
  assert.ok(path.impacts.length>=1);assert.ok(path.impacts.length<=4);
  for(let i=0;i<720;i++){
    const s=path.sample(i/240), c=Math.cos(s.angle),sn=Math.sin(s.angle);
    assert.ok(shape.every(([x,y])=>s.y+x*sn+y*c<=1e-9));
  }
  const end=path.sample(3);assert.ok(end.resting);assert.equal(end.vx,0);assert.equal(end.vy,0);assert.equal(end.spin,0);
  assert.deepEqual(path.sample(9),end);
  for(let i=1;i<path.impacts.length;i++)assert.ok(path.impacts[i].speed<path.impacts[i-1].speed);
  const earlier=path.sample(.33);path.sample(2.4);assert.deepEqual(path.sample(.33),earlier);
  assert.deepEqual(path.impacts,rubblePath(shape,launch,{duration:3}).impacts);
  const sample=path.sample(.5);sample.x=12345;assert.notEqual(path.sample(.5).x,12345);
});
test('rubble parameter guards reject runaway bakes and invalid motion',()=>{
  const launch={x:0,y:-20,vx:0,vy:0},shape=[[-2,-2],[2,2]];
  for(const options of [{duration:31},{duration:0},{gravity:0},{bounce:1},{bounce:-1},{friction:2},{ground:NaN},{gravity:Number.MAX_VALUE}])assert.throws(()=>rubblePath(shape,launch,options),RangeError);
  assert.throws(()=>rubblePath([],launch),RangeError);
  assert.throws(()=>rubblePath(shape,{...launch,spin:Infinity}),RangeError);
  assert.throws(()=>rubblePath(shape,{...launch,vx:Number.MAX_VALUE}),RangeError);
  for(const t of [-1,NaN,Infinity])assert.throws(()=>rubblePath(shape,launch).sample(t),RangeError);
});
function shot(time, options={},fps=120,pad=0){
  const [w,h]=rock.meta.size,f=createFrame(w+2*pad,h+2*pad,-pad,-pad);
  const fx=createFx(rock,{x:rock.meta.origin[0],y:rock.meta.origin[1],...options});
  const steps=Math.round(time*fps);for(let i=0;i<steps;i++)fx.update(time/steps);
  fx.draw(f);return f;
}
const hash=f=>createHash('sha256').update(new Uint8Array(f.color.buffer)).digest('hex');
test('stone motion is deterministic across update rates, seeds and palette overrides',()=>{
  for(const t of [.2,.5,.9,1.2,2.4]){
    assert.equal(hash(shot(t)),hash(shot(t)));
    for(const fps of [30,60,144])assert.equal(hash(shot(t,{},fps)),hash(shot(t)));
    assert.ok(shot(t).light.every(c=>c===0),'unheated rock emits no magical glow');
  }
  assert.notEqual(hash(shot(.5)),hash(shot(.5,{seed:9})));
  assert.notEqual(hash(shot(.5)),hash(shot(.5,{palette:['#111122','#555566','#aaaabb']})));
  assert.ok(shot(.9).color.some(c=>(c>>>24)>0 && (c>>>24)<240),'dust and contact shadows use continuous alpha');
  for(const t of [rock.meta.duration,rock.meta.duration+1]){
    const f=shot(t);assert.ok(f.color.every(c=>c===0));assert.ok(f.light.every(c=>c===0));
  }
});
test('complete rock animations fit raw declared bounds without export cropping',()=>{
  for(const options of [{},{seed:2},{seed:7},{seed:9,pieces:28,force:1.3},{seed:13,pieces:6,force:.5},{flip:true}]){
    const [w,h]=rock.meta.size,pad=24,fx=createFx(rock,{x:rock.meta.origin[0],y:rock.meta.origin[1],...options});
    const f=createFrame(w+pad*2,h+pad*2,-pad,-pad);
    for(let i=0;i<=Math.round(rock.meta.duration*30);i++){
      if(i)fx.update(1/30);f.color.fill(0);f.light.fill(0);fx.draw(f);
      for(let j=0;j<f.color.length;j++)if(f.color[j]>>>24){const x=j%f.w-pad,y=Math.floor(j/f.w)-pad;
        assert.ok(x>=0&&y>=0&&x<w&&y<h,`seed ${options.seed}, frame ${i}: ${x},${y}`);}
    }
  }
});
