import {humanPalettes2D,type HumanStyle} from './human.js';
import {renderHumanPortrait2D,type HumanPortraitStyle,type HumanPortraitPose,type HumanPortraitSprite} from './human-portrait.js';

/** Shared palette/shape identity. Full-body and bust use independently authored native geometry. */
export interface CharacterIdentity2D {
  id:string;name:string;body:HumanStyle;
  portrait:Pick<HumanPortraitStyle,'face'|'hair'|'clothing'|'eyes'>;
  eyePalette?:readonly[string,string,string];
}
export function createCharacterIdentity2D(id:string,name:string,body:HumanStyle={},portrait:CharacterIdentity2D['portrait']={}):CharacterIdentity2D{
  if(!id||!name)throw new RangeError('Character identity needs an ID and name');humanPalettes2D(body);
  const hair=body.hair==='bob'?'bob':body.hair==='ponytail'||body.hair==='bun'?'ponytail':'long';
  return JSON.parse(JSON.stringify({id,name,body,portrait:{face:body.faceShape==='square'?'angular':body.faceShape==='long'?'long':'oval',hair,clothing:body.outfit==='jacket'?'coat':body.outfit==='sweater'?'knit':'blouse',...portrait}}));
}
export function renderCharacterPortrait2D(identity:CharacterIdentity2D,options:{resolution?:HumanPortraitStyle['resolution'];pose?:HumanPortraitPose}={}):HumanPortraitSprite{
  const p=humanPalettes2D(identity.body),style:HumanPortraitStyle={...identity.portrait,resolution:options.resolution??128,facing:identity.body.facing,skin:identity.body.skin,outline:identity.body.outline,
    palettes:{skin:p.skin,hair:[...p.hair,p.hair[2]],cloth:[...p.cloth,p.cloth[2]],...(identity.eyePalette?{eyes:identity.eyePalette}:{})}};
  return renderHumanPortrait2D(style,options.pose);
}
