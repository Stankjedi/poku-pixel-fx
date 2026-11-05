#!/usr/bin/env node
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {join} from 'node:path';
import {createRecipeSpec,RECIPE_KINDS} from '../build/authoring/recipes.js';
import {createProject,serializeProject,createRecipePack} from '../build/authoring/project.js';
import {createProjectRuntime} from '../build/authoring/runtime.js';
import {createRenderProfile3D} from '../build/render/profile3d.js';
import {canvas} from '../build-tools/tools/lib/fxlib.mjs';
import {encodePNG} from '../build-tools/tools/lib/png.mjs';
const ids=['melee/tempered-crescent','melee/socket-ribbon-slash','lightning/focused-arc','explosions/layered-detonation','fire/folded-flame','arcane/depth-portal'];
const samples=[[.2,.55,.95,1.5],[.17,.3,.45,.65],[.1,.3,.6,1],[.22,.4,.8,1.4],[0,.65,1.4,2.25],[0,.75,1.5,2.25]];
const out=process.argv[2]??'examples/recipes',projects='examples/projects';mkdirSync(out,{recursive:true});mkdirSync(projects,{recursive:true});
const sheet=canvas(1280,6*208),diagnostics=canvas(960,6*208);
for(let row=0;row<RECIPE_KINDS.length;row++){
  const kind=RECIPE_KINDS[row],id=ids[row],intentRef=`../../authoring/${id}.intent.json`,recipe=createRecipeSpec(kind,{intentRef}),intent=JSON.parse(readFileSync(`authoring/${id}.intent.json`,'utf8'));
  const project=createProject({id,kind:'recipe',name:kind,seed:1,fps:30,bg:'dark',actor:false,target:false,intentRef,recipe,notes:intent.intent.oneSentence});
  writeFileSync(join(projects,`${kind}.poku-project.json`),serializeProject(project));
  const pack=createRecipePack(project,samples[row].map(time=>({time,note:'Inspect shape, timing and layer separation at this actual sample.'})),['Primary shape must remain readable with glow disabled.','Recheck timing and contacts after moving path or duration.']);pack.intent=intent;
  writeFileSync(join(out,`${kind}.recipe-pack.json`),JSON.stringify(pack,null,2)+'\n');
  const runtime=await createProjectRuntime(project);
  for(let col=0;col<4;col++){const time=samples[row][col],sample=runtime.render(time);sheet.paste(sample.rgba,320,180,col*320,row*208+24);sheet.text(`${kind}  ${time.toFixed(2)}s`,col*320+8,row*208+5,1);}
  const hero=samples[row][1],normal=runtime.render(hero);diagnostics.paste(normal.rgba,320,180,0,row*208+24);diagnostics.text(`${kind} / COLOR`,8,row*208+5,1);
  const plain=await createProjectRuntime({...project,recipe:{...recipe,layers:{...recipe.layers,glow:false}},layers:{glow:false}}),noGlow=plain.render(hero);
  diagnostics.paste(noGlow.rgba,320,180,320,row*208+24);diagnostics.text('OPTICAL GLOW DISABLED',328,row*208+5,1);
  const silhouette=new Uint8ClampedArray(320*180*4);for(let i=0;i<noGlow.frame.color.length;i++){const c=noGlow.frame.color[i],a=c>>>24;silhouette.set([217,237,225,a],i*4);}diagnostics.paste(silhouette,320,180,640,row*208+24);diagnostics.text('RAW COVERAGE SILHOUETTE',648,row*208+5,1);
  runtime.dispose();plain.dispose();
}
writeFileSync(join(out,'recipe-native-frames.png'),encodePNG(sheet.w,sheet.h,sheet.data));writeFileSync(join(out,'recipe-layer-diagnostics.png'),encodePNG(diagnostics.w,diagnostics.h,diagnostics.data));
const character=JSON.parse(readFileSync('examples/character-studio/wayfarer.character.json','utf8'));
writeFileSync(join(projects,'wayfarer-sword.poku-project.json'),serializeProject(createProject({id:'characters/wayfarer',kind:'character',name:'Wayfarer sword',character,options:{clip:'sword'},fps:30,bg:'dark',actor:false,target:false})));
writeFileSync(join(projects,'wayfarer-actor.poku-project.json'),serializeProject(createProject({id:'melee/sword-slash',kind:'act',name:'Wayfarer with sword-slash',fps:30,bg:'ground',options:{actorSelection:{kind:'asset',asset:character,clip:'sword',attachment:'hand'}},actor:true,target:true})));
writeFileSync(join(projects,'frost-native.poku-project.json'),serializeProject(createProject({id:'3d/frost',kind:'3d',name:'Native frost asset',seed:13,fps:30,bg:'none',actor:false,target:false,renderProfile:createRenderProfile3D('frost',{background:null,grid:false,cameraMotion:false,nativeSize:[160,120]})})));
writeFileSync(join(out,'render-manifest.json'),JSON.stringify({schema:'poku.recipe-example-render/v1',ids,samples,nativeSize:[320,180],review:{fullSpeedObserved:false,approval:'not-recorded',note:'Generated evidence is not an approval. Record actual observations separately.'}},null,2)+'\n');
console.log(`Wrote ${ids.length} recipe projects, native sheets, reuse packs and character/ACT/3D project examples.`);
