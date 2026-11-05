/** Native Human/Creature actors on the existing ACT clock. No bitmap scaling. */
import { drawActor, type PixelActor2D } from './actor.js';
import { renderHuman2D, humanViewMotion2D, type HumanStyle, type HumanPose, type HumanPoint, type HumanMotion } from './human.js';
import { renderHumanWeaponPose2D } from './human-weapon.js';
import { renderCreature2D, type CreatureStyle, type CreatureSpecies, type CreatureMotion } from './creature.js';
import type { Painter } from './painter.js';
import type { Pose } from './rig.js';

export interface ActorSelection2D {
  kind: 'human' | 'creature';
  /** Native construction height/size, in pixels; this is not a display scale. */
  height?: number;
  species?: CreatureSpecies;
  style?: HumanStyle | CreatureStyle;
  motion?: 'act' | HumanMotion | CreatureMotion;
  weapon?: 'auto' | 'none' | 'sword' | 'bow';
  attachment?: 'auto' | 'root' | 'hand' | 'head' | 'chest';
}
export interface ActorAnchors2D {
  root: HumanPoint; head: HumanPoint; chest: HumanPoint;
  hand: HumanPoint; otherHand: HumanPoint; foot: HumanPoint; otherFoot: HumanPoint;
}
export type AdaptedActor2D = PixelActor2D & {
  k: number; head: number[]; chest: number[]; anchors: ActorAnchors2D;
};
export interface ActorSample2D {
  actor: AdaptedActor2D;
  bounds: { x0: number; y0: number; x1: number; y1: number };
  pivot: readonly [number, number];
  anchors: ActorAnchors2D;
  drawBack(p: Painter, alpha?: number): void;
  drawFront(p: Painter, alpha?: number): void;
}
export interface ActorAdapter2D {
  readonly selection: ActorSelection2D;
  readonly bounds: ActorSample2D['bounds'];
  /** A sample remains valid after later samples; callers must treat its arrays as read-only. */
  sample(time: number, pose?: Pose): ActorSample2D;
}

function fromAct(q: Pose, broad=false): HumanPose {
  const k=96/38;
  return {
    lean:Math.max(-32,Math.min(32,(q.lean??0)*k)), y:(q.crouch??0)*k,
    leftHand:broad?[(q.bx??5)*k,(q.by??-15)*k]:[(q.fx??-3)*k,(q.fy??-15)*k], rightHand:broad?[(q.fx??-3)*k,(q.fy??-15)*k]:[(q.bx??5)*k,(q.by??-15)*k],
    leftFoot:[(q.ffx??-2)*k,((q.ffy??-4)+4)*k-4],rightFoot:[(q.fbx??3)*k,((q.fby??-4)+4)*k-4],
    leftElbow:1,rightElbow:1,leftKnee:-1,rightKnee:-1,armsFront:!!q.armsFront,fists:!!q.weapon,
  };
}
const move=(p:HumanPoint,x:number,y:number):HumanPoint=>[p[0]+x,p[1]+y];

export function createActorAdapter2D(input: ActorSelection2D): ActorAdapter2D {
  // Snapshot serializable authoring choices. Mutating a caller's palette later cannot change a replay.
  const selection:ActorSelection2D=JSON.parse(JSON.stringify(input));
  if(!['human','creature'].includes(selection.kind))throw new RangeError('Actor kind must be human or creature');
  const height=selection.height??96;
  if(!Number.isFinite(height)||height<32||height>192)throw new RangeError('Native actor height must be 32..192');
  const extent=height*(selection.kind==='creature'?2:1.05);
  let previousKey='',previous:ActorSample2D|undefined;
  return {
    selection,
    bounds:{x0:-extent,y0:-height*1.55,x1:extent,y1:height*.35},
    sample(time, q) {
      if(!Number.isFinite(time))throw new RangeError('Actor sample time must be finite');
      const key=JSON.stringify([time,q]);
      if(previous&&key===previousKey)return previous;
      const rx=Math.round(q?.x??0),ry=Math.round(q?.y??0);
      let sprite:PixelActor2D,anchors:ActorAnchors2D;
      if(selection.kind==='human'){
        const style:HumanStyle={view:'three-quarter',...(selection.style as HumanStyle),height};
        const motion=selection.motion??'act';
        const pose=motion==='act'&&q?fromAct(q,style.view==='front'||style.view==='back'):humanViewMotion2D(style.view??'three-quarter',(motion==='act'?'idle':motion) as HumanMotion,time);
        const requested=selection.weapon??'auto',weapon=requested==='auto'?q?.weapon:requested;
        const body=weapon==='sword'||weapon==='bow'?renderHumanWeaponPose2D(weapon,pose,style,q?.sa??0,!!q?.nocked).actor:renderHuman2D(style,pose);
        const r=body.rig,front=r.view==='front'||r.view==='back';
        sprite={...body,x:body.x+rx,y:body.y+ry,renderSource:'pixels'};
        anchors={root:[rx,ry],head:move(r.head,rx,ry),chest:move(r.chest,rx,ry),
          hand:move(front?r.rightHand:r.leftHand,rx,ry),otherHand:move(front?r.leftHand:r.rightHand,rx,ry),
          foot:move(r.leftAnkle,rx,ry),otherFoot:move(r.rightAnkle,rx,ry)};
      }else{
        const style:CreatureStyle={...(selection.style as CreatureStyle),species:selection.species??'cat',size:height};
        const motion=selection.motion??'idle',mode=(motion==='act'?'idle':motion) as CreatureMotion;
        const body=renderCreature2D(style,mode,time),r=body.rig;
        sprite={...body,x:body.x+rx,y:body.y+ry,renderSource:'pixels'};
        const near=r.legs.find(l=>l.name==='nearFront'),far=r.legs.find(l=>l.name==='farFront');
        anchors={root:[rx,ry],head:move(r.head,rx,ry),chest:move(r.root,rx,ry),hand:move(near?.toe??r.head,rx,ry),otherHand:move(far?.toe??r.head,rx,ry),foot:move(near?.toe??[0,0],rx,ry),otherFoot:move(far?.toe??[0,0],rx,ry)};
      }
      // Legacy status effects use head as the top of the silhouette, rather than the head's center.
      const actor:AdaptedActor2D={...sprite,k:height/19,head:[anchors.head[0],sprite.y],chest:[...anchors.chest],anchors};
      const sample:ActorSample2D={actor,anchors,pivot:[0,0],bounds:{x0:actor.x,y0:actor.y,x1:actor.x+actor.w,y1:actor.y+actor.h},
        drawBack(){},drawFront(p,alpha=1){drawActor(p,actor,alpha);}};
      previousKey=key;previous=sample;return sample;
    },
  };
}

/** Offset an authored 38px ACT attachment to its selected native actor, retaining local FX art. */
export function actorEffectOffset2D(sample:ActorSample2D,q:Pose,onBody:boolean,selection:ActorSelection2D):[number,number]{
  let attachment=selection.attachment??'auto';
  if(attachment==='auto')attachment=onBody?'root':q.weapon?'hand':'root';
  if(attachment==='root')return [0,0];
  const reference:HumanPoint=attachment==='hand'?[(q.x??0)+(q.fx??-3),(q.y??0)+(q.fy??-15)]:attachment==='head'?[(q.x??0),-38+(q.y??0)]:[(q.x??0),-26+(q.y??0)];
  const p=sample.anchors[attachment];
  return [Math.round(p[0]-reference[0]),Math.round(p[1]-reference[1])];
}
