// Timing-curve authoring study, not an automatic visual-quality preset.
import {createTimingCurve,createDetailParticles2D,fit,samplePointLight2D} from '../../core/index.js';
import type {Painter,Point} from '../../core/painter.js';
export const meta={name:'Timing Comet',desc:'A small amber comet demonstrates separately authored travel, width, opacity and light curves. The final motion key can hold or continue at its authored velocity.',
 tags:['projectiles','timing','authoring-study','curves'],size:[320,160],origin:[112,104],duration:2.5,loop:false,fps:50,bg:'black',
 options:{seed:727,coast:true,palette:['#241b31','#53283e','#94444b','#cc6655','#ef9b64','#f7ce87','#fff0bc']}};
type Options=Omit<typeof meta.options,'palette'>&{palette:(string|number)[]};
export const travelKeys=[
 {time:0,value:-87,velocity:0},{time:.25,value:-84},{time:.62,value:-48},
 {time:1.05,value:24},{time:1.25,value:52,velocity:135},
];
export function createCometTracks(coast=true){
 return{
  travel:createTimingCurve(travelKeys,{after:coast?'continue':'hold'}),
  width:createTimingCurve([{time:0,value:0},{time:.16,value:1},{time:1.72,value:1},{time:2.25,value:.35}]),
  opacity:createTimingCurve([{time:0,value:0},{time:.12,value:1},{time:1.85,value:1},{time:2.30,value:0,velocity:0}]),
  light:createTimingCurve([{time:0,value:0},{time:.27,value:.32},{time:.72,value:.25},{time:1.30,value:.18},{time:2.15,value:0,velocity:0}]),
 };
}
export function cometPosition(x:number):Point{return[x,-18-.25*(x+90)+.0006*(x+90)**2];}
const slope=(x:number)=>-.25+.0012*(x+90);
export function create(o:Options){
 const C=fit(o.palette,7),tracks=createCometTracks(o.coast);
 const position=(t:number)=>cometPosition(tracks.travel.sample(t).value);
 const sparks=createDetailParticles2D({count:20,seed:o.seed,palette:[C[5],C[4],C[2]],start:.55,duration:1.2,life:[.24,.43],
   origin:(birth,id)=>{const P=position(birth);return[P[0]-3,P[1]+(id%3-1)*3];},
   inheritedVelocity:birth=>{const q=tracks.travel.sample(birth);return[q.velocity*.60,q.velocity*slope(q.value)*.60];},
   angle:Math.PI,spread:.6,speed:[10,25],gravity:14,drag:1.8,size:[.65,1.1],endSize:.3,style:'spark',trailSeconds:.045,opacity:.8,emission:.018});
 return{draw(p:Painter,t:number){
  if(t<=0||t>=meta.duration)return;
  const alpha=tracks.opacity.sample(t).value,w=tracks.width.sample(t).value,light=tracks.light.sample(t).value;
  const P=position(t),m=slope(P[0]),len=Math.hypot(1,m),T:Point=[1/len,m/len],N:Point=[-T[1],T[0]];
  if(alpha>0){
    const a:Point[]=[],b:Point[]=[],highlight:Point[]=[];
    for(let i=0;i<=22;i++){
      const u=i/22,Q=position(Math.max(0,t-.27*(1-u))),s=slope(Q[0]),normal:Point=[-s/Math.hypot(1,s),1/Math.hypot(1,s)];
      const radius=(.18+u*3.8)*w;
      a.push([Q[0]+normal[0]*radius,Q[1]+normal[1]*radius]);b.push([Q[0]-normal[0]*radius,Q[1]-normal[1]*radius]);
      highlight.push([Q[0]-normal[0]*radius*.4,Q[1]-normal[1]*radius*.4]);
    }
    p.poly([...a,...b.reverse()],C[2],alpha*.9);p.path(highlight,C[4],alpha*.95,2.1*w);
    const point=(forward:number,side:number):Point=>[P[0]+T[0]*forward+N[0]*side,P[1]+T[1]*forward+N[1]*side];
    const tip=point(10*w,0),top=point(-1,-5*w),back=point(-8*w,0),bottom=point(-1,5*w);
    const illumination=samplePointLight2D({position:[P[0]-5,P[1]-10,-18],radius:42,intensity:light*4},[P[0],P[1],0],[-N[0]*.4,-N[1]*.4,-.8]).diffuse;
    p.poly([tip,top,back,bottom],C[3],alpha);p.poly([tip,top,back],C[illumination>.5?5:4],alpha);
    p.path([back,top,tip],C[6],alpha*.9,.9);p.path([point(-2,0),tip],C[5],alpha,1.3);
    p.glow(P[0],P[1],19*w,C[4],light*alpha);
  }
  sparks.draw(p,t);
 }};
}
