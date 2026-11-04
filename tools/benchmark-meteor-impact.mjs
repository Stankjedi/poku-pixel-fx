/** Compare builds on identical animated meteor frames, alternating render order.
 * Usage: node tools/benchmark-meteor-impact.mjs build [path/to/baseline-build]
 * Advisory timings only: shared hosts are not suitable for timing assertions.
 */
import {performance} from 'node:perf_hooks';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
const paths=process.argv.slice(2);if(!paths.length)paths.push('build');
const renderers=await Promise.all(paths.map(async path=>{
 const engine=await import(pathToFileURL(resolve(path,'3d/index.js')));
 const frame=engine.createFrame3D(260,180);engine.enableHDRLight(frame);
 const painter=new engine.Painter3D(frame,{yaw:0.68,elevation:28*Math.PI/180,zoom:0.98,target:[0,2.3,0]});
 return {path,engine,frame,painter,rounds:[],cached:[]};
}));
const mean=a=>a.reduce((s,v)=>s+v,0)/a.length;
const percentile=(a,p)=>[...a].sort((a,b)=>a-b)[Math.min(a.length-1,Math.floor(a.length*p))];
const median=a=>percentile(a,0.5);
for(let round=0;round<7;round++){
 for(const r of renderers){r.fx=r.engine.createFx3D(r.engine.meteorImpact3D);r.times=[];r.dust=[];}
 for(let step=1;step<=112;step++)for(const r of (round+step)%2?[...renderers].reverse():renderers){
  r.fx.update(0.05);r.painter.begin('#0a1525');
  const start=performance.now();r.fx.draw(r.painter);const elapsed=performance.now()-start;r.times.push(elapsed);
  if(step>=35&&step<=84)r.dust.push(elapsed);
 }
 if(round>=2)for(const r of renderers)r.rounds.push({meanMs:mean(r.times),dustMeanMs:mean(r.dust),p95Ms:percentile(r.times,0.95),dustP95Ms:percentile(r.dust,0.95)});
}
for(const r of renderers){r.fx.seek(2.4);r.fx.draw(r.painter);}
for(let i=0;i<100;i++)for(const r of i%2?[...renderers].reverse():renderers){
 r.painter.begin('#0a1525');const start=performance.now();r.fx.draw(r.painter);if(i>=20)r.cached.push(performance.now()-start);
}
console.log(JSON.stringify({node:process.version,dimensions:[260,180],warmupRounds:2,measuredRounds:5,framesPerRound:112,
 results:renderers.map(r=>({path:r.path,medianMeanMs:median(r.rounds.map(v=>v.meanMs)),medianDustMeanMs:median(r.rounds.map(v=>v.dustMeanMs)),medianP95Ms:median(r.rounds.map(v=>v.p95Ms)),medianDustP95Ms:median(r.rounds.map(v=>v.dustP95Ms)),cachedMeanMs:mean(r.cached),rounds:r.rounds}))},null,2));
