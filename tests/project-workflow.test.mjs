// Isolated synthetic validator records exercise binding only. They are never artwork/user approvals.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,cpSync,readFileSync,writeFileSync,existsSync,rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { intentTemplate,PHASES,TOPICS,readIntentContext,intentReviewTemplate } from '../tools/lib/effect-intent.mjs';
import { createRenderProfile3D } from '../build/render/profile3d.js';
import { meta as frostMeta } from '../build/3d/effects/frost-nova.js';
const checkout=fileURLToPath(new URL('../',import.meta.url));
const json=file=>JSON.parse(readFileSync(file,'utf8'));
const save=(file,value)=>{mkdirSync(dirname(file),{recursive:true});writeFileSync(file,JSON.stringify(value,null,2));};
function brief(id,duration=1,loop=false){
  const b=intentTemplate(id);
  for(const key of Object.keys(b.intent))b.intent[key]='Synthetic binding fixture; no artwork evaluated.';
  for(const key of Object.keys(b.readability))b.readability[key]=key==='intendedBackgrounds'?['Synthetic backdrop']:'Synthetic binding field.';
  for(const key of Object.keys(b.mechanics))if(key!=='model')b.mechanics[key]='Synthetic validator fixture; no physics claim.';
  b.mechanics.model='symbolic-ui';b.timeline={durationSeconds:duration,loop,phases:PHASES.map((name,i)=>({name,from:i*duration/4,to:(i+1)*duration/4,
    action:'Synthetic state.',cause:'Validator fixture.',visibleCue:'Synthetic marker.'})),omittedPhases:{}};return b;
}
test('project export/review/share bind seed, edits, source, output and ACT/3D variants',()=>{
  const root=mkdtempSync(join(tmpdir(),'poku project workflow '));
  try{
    for(const name of ['build','build-tools'])cpSync(join(checkout,name),join(root,name),{recursive:true});
    for(const name of ['package.json','tools/effect-intent.mjs','tools/lib/effect-intent.mjs','src/3d/effects/frost-nova.ts']){
      mkdirSync(dirname(join(root,name)),{recursive:true});cpSync(join(checkout,name),join(root,name));
    }
    const id='test/project-fixture',source=`// Synthetic test fixture only.\nexport const meta={name:'Synthetic project fixture',size:[4,4],origin:[0,0],duration:1,loop:false,fps:4,bg:'none',options:{seed:1}};\nexport const act={poses:[[-.25,{}],[1.25,{}]],hits:[{t:.5,stop:.25,target:false}]};\nexport function draw(p,t,o){if(t<1){p.dot(1,1,(0xff201000|(o.seed&255))>>>0);p.light(2,1,0xffffffff,2);}}\nexport function socketsAt(t){return{grip:{x:1+t,y:2,angle:t,visible:true}};}\n`;
    const sourcePath=join(root,'src/fx',id+'.ts'),builtPath=join(root,'build/fx',id+'.js');
    mkdirSync(dirname(sourcePath),{recursive:true});mkdirSync(dirname(builtPath),{recursive:true});writeFileSync(sourcePath,source);writeFileSync(builtPath,source);
    save(join(root,'fixture.intent.json'),brief(id));
    const projectFile=join(root,'fixture.project.json'),project={schema:'poku.project/v1',id,kind:'2d',seed:7,fps:4,bg:'none',actor:false,target:false,intentRef:'fixture.intent.json'};
    save(projectFile,project);
    const env={...process.env};delete env.POKU_WORKSPACE;
    const run=(status,tool,...args)=>{const result=spawnSync(process.execPath,[join(root,tool),...args],{cwd:root,encoding:'utf8',timeout:30000,env});assert.equal(result.status,status,result.stderr+'\n'+result.stdout);return result;};
    run(0,'build-tools/tools/render.mjs','--project',projectFile,'--bundle','--trim','--deduplicate','--max-texture','32','--out',join(root,'exports'));
    const asset=json(join(root,'exports',id,'project-fixture.asset.json'));
    assert.equal(asset.schema,'poku-asset/v1');assert.equal(asset.frames.length,5);assert.equal(asset.frames[0].sockets.grip.x,1);
    assert.equal(asset.pages[0].emission.format,'float32-le');assert.match(asset.source.projectSha256,/^[0-9a-f]{64}$/);
    const prepared=JSON.parse(run(0,'build-tools/tools/review.mjs','--project',projectFile).stdout);
    const context=readIntentContext(root,id,undefined,prepared.variant);assert.equal(context.manifest.context.projectSha256,asset.source.projectSha256);
    assert.equal(json(prepared.intentTemplate).userApproval.status,'not-recorded');assert.equal(existsSync(join(context.dir,'review.json')),false);
    run(1,'build-tools/tools/share.mjs','--project',projectFile);
    // Synthetic positive-path fixtures stay entirely in this disposable directory.
    const visual=json(prepared.template);Object.assign(visual,{reviewer:'SYNTHETIC VALIDATOR ONLY',reviewedAt:'2026-11-05T12:00:00Z',evidenceViewed:true,decision:'ready',
      intent:'Only exercise project-version binding.',knownLimitations:'Synthetic test fields; no inspection or user approval.'});
    for(const key of Object.keys(visual.observations))visual.observations[key]='Synthetic validator input, not an observed finding.';
    save(join(root,'visual.fixture.json'),visual);run(0,'build-tools/tools/review.mjs','--project',projectFile,'--record',join(root,'visual.fixture.json'));
    const intent=intentReviewTemplate(context);intent.reviewer={name:'SYNTHETIC VALIDATOR ONLY',kind:'agent',relationship:'author'};intent.reviewedAt='2026-11-05T12:00:00Z';
    for(const key of Object.keys(intent.viewed))intent.viewed[key]=true;
    intent.firstRead={method:'informed-self-review',description:'Synthetic binding test; no real artwork.',matchesIntent:true,confusions:'No first impression measured.'};
    for(const topic of TOPICS)intent.observations[topic]={result:'pass',note:'Synthetic validator input only.',frameRanges:[{from:0,to:4}]};
    intent.knownLimitations='No artwork, inspection or user approval established.';intent.decision='ready';intent.nextChanges=[];
    save(join(root,'intent.fixture.json'),intent);run(0,'tools/effect-intent.mjs','record',id,join(root,'intent.fixture.json'),'--variant',prepared.variant);
    const shared=JSON.parse(run(0,'build-tools/tools/share.mjs','--project',projectFile).stdout);
    assert.equal(shared.variant,prepared.variant);assert.equal(json(shared.intentReview).review.userApproval.status,'not-recorded');
    assert.deepEqual(json(shared.json).meta.pokuFx.settings.project.seed,7);
    save(projectFile,{...project,seed:8});run(1,'build-tools/tools/share.mjs','--project',projectFile);
    save(projectFile,{...project,edits:[{frame:0,x:0,y:0,color:0xffffffff,channel:'color'}]});run(1,'build-tools/tools/share.mjs','--project',projectFile);
    save(projectFile,project);writeFileSync(sourcePath,source+'// A changed source invalidates old evidence.\n');run(1,'build-tools/tools/share.mjs','--project',projectFile);
    writeFileSync(sourcePath,source);writeFileSync(builtPath,source.replace('0xff201000','0xffa09000'));run(1,'build-tools/tools/share.mjs','--project',projectFile);writeFileSync(builtPath,source);
    // ACT review counts its full timeline, not meta.duration * fps.
    save(projectFile,{...project,kind:'act',hold:0});const acted=JSON.parse(run(0,'build-tools/tools/review.mjs','--project',projectFile).stdout);
    const actContext=readIntentContext(root,id,undefined,acted.variant);assert.equal(actContext.manifest.context.kind,'act');assert.ok(actContext.manifest.frames>5);
    assert.notEqual(acted.variant,prepared.variant);
    // 3D profile and source are accepted by the same evidence/binding workflow.
    const id3='3d/frost-nova';save(join(root,'three.intent.json'),brief(id3,frostMeta.duration,!!frostMeta.loop));
    save(projectFile,{schema:'poku.project/v1',id:id3,kind:'3d',seed:1,fps:10,seconds:.2,intentRef:'three.intent.json',renderProfile:createRenderProfile3D('frost',{nativeSize:[24,16],background:null,grid:false,cameraMotion:false})});
    const three=JSON.parse(run(0,'build-tools/tools/review.mjs','--project',projectFile).stdout);
    assert.equal(readIntentContext(root,id3,undefined,three.variant).manifest.context.source,'src/3d/effects/frost-nova.ts');
    run(1,'build-tools/tools/share.mjs','--project',projectFile);
    // Studio downloads can live outside the source tree while keeping a canonical authoring path.
    const canonical=`authoring/${id}.intent.json`,nested=join(root,'downloaded','nested.project.json');
    save(join(root,canonical),brief(id));save(nested,{...project,intentRef:canonical});
    const fallback=JSON.parse(run(0,'build-tools/tools/review.mjs','--project',nested).stdout);
    assert.equal(fallback.intentSource,join(root,canonical));
    save(join(root,'downloaded',canonical),brief(id));
    const adjacent=JSON.parse(run(0,'build-tools/tools/review.mjs','--project',nested).stdout);
    assert.equal(adjacent.intentSource,join(root,'downloaded',canonical),'an explicit adjacent file wins');
    save(nested,{...project,intentRef:'missing.intent.json'});run(1,'build-tools/tools/review.mjs','--project',nested);
  }finally{rmSync(root,{recursive:true,force:true});}
});
