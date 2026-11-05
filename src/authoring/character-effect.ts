import { createStudioCharacter2D, createCharacterPlayer2D, parseCharacterAsset2D } from '../core/character-asset.js';
/** Adapt an editable character asset to the same render/review/export flow as effects. */
export function createCharacterEffect(input?: unknown, requestedClip?: string, fps=30) {
  const asset = input === undefined ? createStudioCharacter2D() : parseCharacterAsset2D(JSON.stringify(input));
  const player = createCharacterPlayer2D(asset);
  const clipName = requestedClip ?? asset.defaultClip;
  if (!player.clips.includes(clipName)) throw new RangeError(`Unknown character clip: ${clipName}`);
  const clip = player.clipInfo(clipName);
  const b=player.boundsForClip(clipName,fps), origin:[number,number]=[-b.x0,-b.y0], size:[number,number]=[b.x1-b.x0,b.y1-b.y0];
  return {
    meta:{name:asset.name,desc:`${asset.name} · ${clipName}`,size,origin,duration:clip.duration,loop:clip.loop??false,fps,bg:'none',tags:['character',clipName],options:{seed:1}},
    draw(p:Parameters<typeof player.draw>[0],time:number){
      const sample=player.draw(p,time,clipName);
      const f=p.frame as typeof p.frame & {semanticMasks?:Record<string,Uint8Array>};
      f.semanticMasks??=Object.create(null);
      for(const [name,mask] of Object.entries(sample.semanticMasks)){
        const dest=f.semanticMasks![name]??=new Uint8Array(f.w*f.h),s=sample.actor;
        p.each(s.x,s.y,s.x+s.w,s.y+s.h,(lx,ly,sx,sy)=>{
          const xx=Math.floor(lx-s.x),yy=Math.floor(ly-s.y);
          if(xx>=0&&yy>=0&&xx<s.w&&yy<s.h&&mask[yy*s.w+xx])dest[(sy-f.oy)*f.w+sx-f.ox]=1;
        });
      }
    },
    socketsAt(time:number){
      return Object.fromEntries(Object.entries(player.sample(time,clipName).sockets).map(([name,s])=>[name,{x:s.position[0]+origin[0],y:s.position[1]+origin[1],angle:Math.atan2(s.basisX[1],s.basisX[0]),basisX:[...s.basisX],basisY:[...s.basisY],mirrorPolicy:s.mirrorPolicy,visible:s.visible}]));
    },
    events:clip.events, character:asset, player, clipName,
  };
}
