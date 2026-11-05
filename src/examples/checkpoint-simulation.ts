import {Rng} from '../core/math.js';
import {hex} from '../core/color.js';
import type {EffectModule} from '../core/fx.js';

interface Particle{x:number;y:number;vx:number;vy:number;life:number}
interface State{rng:number;emission:number;particles:Particle[]}
/** Stateful deterministic example: the complete RNG, spawn remainder and live particles are checkpointed. */
export const checkpointFountain:EffectModule={
  meta:{name:'Checkpoint Fountain',desc:'Stateful seek reference',size:[128,128],origin:[64,112],duration:12,loop:true,fps:30,options:{seed:13}},
  create(options){
    const rng=new Rng(Number(options.seed??13));let emission=0,particles:Particle[]=[];
    return{
      update(dt){
        emission+=dt*18;while(emission>=1){emission--;particles.push({x:0,y:0,vx:rng.range(-18,18),vy:rng.range(-88,-58),life:rng.range(.7,1.3)});}
        for(const p of particles){p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=75*dt;p.life-=dt;}particles=particles.filter(p=>p.life>0);
      },
      draw(p){for(const s of particles)p.rect(s.x,s.y,2,2,hex('#b9e6d0'),Math.min(1,s.life*3));},
      captureState:():State=>({rng:rng.captureState(),emission,particles:particles.map(p=>({...p}))}),
      restoreState(raw){const state=raw as State;if(!state||!Number.isFinite(state.emission)||!Array.isArray(state.particles))throw new RangeError('Invalid fountain checkpoint');rng.restoreState(state.rng);emission=state.emission;particles=state.particles.map(p=>({...p}));},
    };
  },
};
