// Opt-in authoring recipe, not a scheduler or an anatomical inference API.
import { createSpriteClip2D } from '../../build/core/sprite-clip.js';
import { captureSpriteSocketBirth2D } from '../../build/core/sprite-socket-birth.js';
const finite = Number.isFinite;
const pair = v => Array.isArray(v) && v.length === 2 && v.every(finite);
const text = v => typeof v === 'string' && v.trim().length > 0;
const freeze = v => { if (v && typeof v === 'object') { Object.values(v).forEach(freeze); Object.freeze(v); } return v; };

/** Explicit millisecond events + selected clip clock + translation-only source roots.
 * Supply per-pose socket metadata yourself (including hidden sockets/fallbacks).
 * The returned ordinary EffectModule works with createFx; no registry/UI mutation.
 */
export function createSocketSparkRecipe(input) {
  const c = structuredClone(input);
  if (!c || c.version !== 1 || !text(c.name) || !pair(c.size)
    || !c.size.every(v => Number.isSafeInteger(v) && v > 0 && v <= 4096)
    || !pair(c.origin) || !finite(c.durationMs) || c.durationMs <= 0
    || !finite(c.clipClockOffsetMs) || !Array.isArray(c.roots) || !c.roots.length
    || c.roots.length > 4096 || !Array.isArray(c.events) || c.events.length > 4096)
    throw new RangeError('Invalid socket spark recipe');
  const clip = createSpriteClip2D(c.clip, c.clipOptions ?? {});
  c.roots.forEach((k,i) => {
    if (!k || !finite(k.atMs) || k.atMs < 0 || k.atMs > c.durationMs || !pair(k.position)
      || i > 0 && k.atMs <= c.roots[i-1].atMs) throw new RangeError('Invalid source root keys');
  });
  if (c.roots[0].atMs !== 0 || c.roots.at(-1).atMs !== c.durationMs)
    throw new RangeError('Root keys must cover the full effect duration');
  const rootAt = time => {
    const ms = Math.max(0,Math.min(c.durationMs,time*1000));
    let i=1; while(i<c.roots.length-1 && c.roots[i].atMs<ms) i++;
    const a=c.roots[i-1], b=c.roots[i] ?? a;
    const u=b.atMs===a.atMs?0:(ms-a.atMs)/(b.atMs-a.atMs);
    return a.position.map((v,j)=>v+(b.position[j]-v)*u);
  };
  // One conversion path for both birth capture and displayed pose, including boundaries.
  const clipTimeAt = time => (time * 1000 + c.clipClockOffsetMs) / 1000;
  const ids=new Set();
  const births=c.events.map(event => {
    if (!event || !text(event.id) || ids.has(event.id) || !text(event.sourceRole)
      || !finite(event.birthMs) || event.birthMs<0 || !finite(event.lifeMs)
      || event.lifeMs<=0 || event.lifeMs>300 || event.birthMs+event.lifeMs>c.durationMs
      || !pair(event.velocity) || !Number.isSafeInteger(event.color) || event.color<1 || event.color>0xffffffff
      || !finite(event.light) || event.light<0 || event.light>2
      || event.unavailable!=='throw' && event.unavailable!=='skip') throw new RangeError('Invalid scheduled spark');
    ids.add(event.id);
    const birthTime=event.birthMs/1000, [x,y]=rootAt(birthTime);
    const source=captureSpriteSocketBirth2D({clip,socket:event.socket,fallbackSocket:event.fallbackSocket,
      unavailable:event.unavailable,birthTime,clipTime:clipTimeAt(birthTime),
      world:[1,0,0,1,x,y],velocity:event.velocity,offset:event.offset});
    // Preserve original attributes and skipped slots. Do not renumber or reschedule.
    return freeze({event,source});
  });
  freeze(c); freeze(births);
  const meta=freeze({name:c.name,desc:'Authored moving sprite source with detached short sparks.',
    tags:['socket','authored'],size:c.size,origin:c.origin,duration:c.durationMs/1000,
    fps:30,loop:false,options:{}});
  function draw(p,t) {
    if (!finite(t) || t<0 || t>=meta.duration) return;
    const [x,y]=rootAt(t), saved={tx:p.tx,ty:p.ty};
    try {
      // Compose local translation with the host effect placement. Do not reset flip/rotation/style.
      const tx=p.toX(x,y),ty=p.toY(x,y); p.tx=tx;p.ty=ty;
      clip.draw(p,clipTimeAt(t));
    } finally {Object.assign(p,saved);}
    for (const {event:e,source:s} of births) {
      if(!s) continue;
      const age=t-s.birthTime, life=e.lifeMs/1000;
      if(age<0 || age>=life) continue;
      const alpha=Math.min(1,(life-age)/Math.min(.045,life));
      const px=s.x+s.vx*age,py=s.y+s.vy*age;
      const exposure=Math.min(age,.018,2/Math.max(1,Math.hypot(s.vx,s.vy)));
      p.line(px-s.vx*exposure,py-s.vy*exposure,px,py,e.color,alpha);
      p.rect(px,py,1,1,e.color,alpha);
      if(e.light>0) p.glow(px,py,2,e.color,e.light*alpha);
    }
  }
  return Object.freeze({meta,draw,births,config:c});
}
