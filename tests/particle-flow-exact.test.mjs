import test from 'node:test';import assert from 'node:assert/strict';
import {noise2,createCurlFlow2D,createCinematicParticles2D} from '../build/core/index.js';
function originalField({seed,scale,strength,drift}){const[vx,vy]=drift,e=.001;const stream=(x,y)=>noise2(x,y,seed)+.18*noise2(x*2.1+17,y*2.1-11,seed^0x631a);return(x,y,t)=>{const a=(x-t*vx)/scale,b=(y-t*vy)/scale;return[(stream(a,b+e)-stream(a,b-e))/(2*e)*strength,-(stream(a+e,b)-stream(a-e,b))/(2*e)*strength];};}
test('cached curl remains exactly equal to original noise2 across cells and sample orders',()=>{
 for(const seed of[0,17,0xffffffff])for(const scale of[.25,28,4096]){
  const options={seed,scale,strength:70,drift:[5,-22]},a=originalField(options),b=createCurlFlow2D(options);
  for(let i=0;i<300;i++){
   const x=i%3?(Math.sin(i*11.7)*300):(i-150)*scale+.001,y=i%5?Math.cos(i*19.3)*217:(i-150)*scale-.001,t=(i%91)*.031;
   assert.deepEqual(b(x,y,t),a(x,y,t));b(1e6+i,-1e6-i,2);assert.deepEqual(b(x,y,t),a(x,y,t));
  }
 }
});
// The pre-optimization allocation-based RK4 arithmetic is retained here as an exact reference.
function originalPath(p,flow,drag,gravity,maxStep){
 const steps=Math.ceil(p.life/(drag>0?Math.min(maxStep,.25/drag):maxStep)),dt=p.life/steps,data=new Float64Array((steps+1)*4);
 let state=[p.x,p.y,p.vx,p.vy];data.set(state);
 const derivative=(v,t)=>{const f=flow(v[0],v[1],p.born+t);return[v[2],v[3],f[0]-drag*v[2],gravity+f[1]-drag*v[3]];};
 for(let n=0;n<steps;n++){const t=n*dt,k1=derivative(state,t),k2=derivative(state.map((v,i)=>v+k1[i]*dt/2),t+dt/2),k3=derivative(state.map((v,i)=>v+k2[i]*dt/2),t+dt/2),k4=derivative(state.map((v,i)=>v+k3[i]*dt),t+dt);state=state.map((v,i)=>v+dt/6*(k1[i]+2*k2[i]+2*k3[i]+k4[i]));data.set(state,(n+1)*4);}
 return age=>{const at=Math.max(0,Math.min(steps,age/dt)),n=Math.min(steps-1,Math.floor(at)),u=at-n,a=n*4,b=a+4,u2=u*u,u3=u2*u,xy=[],v=[];
  for(let k=0;k<2;k++){xy[k]=(2*u3-3*u2+1)*data[a+k]+(u3-2*u2+u)*dt*data[a+k+2]+(-2*u3+3*u2)*data[b+k]+(u3-u2)*dt*data[b+k+2];v[k]=(6*u2-6*u)/dt*data[a+k]+(3*u2-4*u+1)*data[a+k+2]+(-6*u2+6*u)/dt*data[b+k]+(3*u2-2*u)*data[b+k+2];}return[...xy,...v];};
}
test('scalar RK4 retains exact original paths and interpolated velocities for custom and curl forces',()=>{
 const config={seed:218,scale:23,strength:41,drift:[3,-8]};
 for(const drag of[0,.8,100])for(const kind of['zero','custom','curl']){
  const force=kind==='zero'?()=>[0,0]:kind==='custom'?(x,y,t)=>[Math.sin(y*.1+t)*12,Math.cos(x*.2-t)*9]:originalField(config);
  const e=createCinematicParticles2D({count:3,seed:17,palette:['#fff'],start:.21,duration:0,life:.65,speed:[18,70],gravity:-7,drag,flowStep:1/30,flow:kind==='curl'?createCurlFlow2D(config):force});
  const paths=e.particles.map(p=>originalPath(p,force,drag,-7,1/30));
  for(const age of[0,.001,.12345,.33333,.549,.649])for(const q of e.sample(.21+age))assert.deepEqual([q.x,q.y,q.vx,q.vy],paths[q.id](q.age));
 }
});
