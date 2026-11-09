import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync,mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,realpathSync } from 'node:fs';
import { dirname,delimiter,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
function npmCLI(){
  const candidates=[process.env.npm_execpath,join(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),join(dirname(process.execPath),'../lib/node_modules/npm/bin/npm-cli.js')];
  for(const directory of (process.env.PATH??'').split(delimiter)){
    for(const name of ['npm','npm.cmd']){const path=join(directory,name);if(existsSync(path)){const real=realpathSync(path);if(real.endsWith('.js'))candidates.push(real);}}
    candidates.push(join(directory,'node_modules/npm/bin/npm-cli.js'),join(directory,'../lib/node_modules/npm/bin/npm-cli.js'),join(directory,'../share/nodejs/npm/bin/npm-cli.js'));
  }
  const found=candidates.find(path=>path&&existsSync(path)&&path.endsWith('.js'));assert.ok(found,'Run this clean package test with npm run test:install (npm CLI must be installed)');return resolve(found);
}
test('packed release installs without build tools and runs ESM + CLI from a workspace path containing spaces',{timeout:120000},()=>{
  const temp=mkdtempSync(join(tmpdir(),'poku clean install ')),work=join(temp,'consumer workspace');mkdirSync(work);
  try{
    const cli=npmCLI(),run=(cwd,args)=>{const result=spawnSync(process.execPath,args,{cwd,encoding:'utf8',timeout:60000,env:{...process.env,POKU_WORKSPACE:work}});assert.equal(result.status,0,result.stdout+'\n'+result.stderr);return result;};
    const packed=JSON.parse(run(root,[cli,'pack','--json','--ignore-scripts','--pack-destination',temp]).stdout)[0];
    const paths=new Set(packed.files.map(file=>file.path));
    for(const path of ['tools/poku.mjs','tools/effect-intent.mjs','tools/lib/effect-intent.mjs','build-tools/tools/render.mjs','build/authoring/project.js','build/authoring/ice-generation.js','build/authoring/water-generation.js','build/authoring/lightning-generation.js','build/core/fracture2d.js','build/authoring/generation-starter.js','build/core/particle-volume.js','build/core/charge-volume.js','build/core/crystal-surface.js',
      'build-gallery/studio.js','build-gallery/studio-worker.js','gallery/studio.html','gallery/fonts/SUIT-Variable.woff2','src/fx/projectiles/arrow.ts','LICENSE','NOTICE.md'])assert.ok(paths.has(path),`release is missing ${path}`);
    writeFileSync(join(work,'package.json'),JSON.stringify({name:'synthetic-poku-consumer',version:'1.0.0',private:true,type:'module'}));
    run(work,[cli,'install','--ignore-scripts','--offline','--no-audit','--no-fund','--omit=dev',join(temp,packed.filename)]);
    const installed=join(work,'node_modules/poku-pixel-fx');
    assert.equal(existsSync(join(work,'node_modules/typescript')),false,'consumer never compiles the library');
    const help=run(work,[cli,'exec','--offline','--','poku-fx','--help']);assert.match(help.stdout,/POKU Pixel FX/);
    const version=run(work,[join(installed,'tools/poku.mjs'),'--version']);assert.equal(version.stdout.trim(),JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version);
    writeFileSync(join(work,'smoke.mjs'),`import {createFrame,createCurlFlow2D,createCinematicParticles2D,createParticleVolume2D,createChargeVolume2D} from 'poku-pixel-fx';\nimport {createFrame3D} from 'poku-pixel-fx/3d';\nimport {createGenerationPlan2D,createGeneratedEffect2D,createGenerationStarter2D} from 'poku-pixel-fx/authoring';\nconst flow=createCurlFlow2D({seed:2});\nconst charge=createChargeVolume2D({palette:['#fff']});\nif(typeof charge.draw!=='function')throw new Error('Installed charge material failed');\nconst energy=createGeneratedEffect2D(createGenerationPlan2D({material:'energy',action:'dash'}),{composition:'material-volumes'});\nif(!energy.create(energy.meta.options))throw new Error('Installed material composition failed');\nconst matter=createParticleVolume2D({profile:'fire',palette:['#fff']});\nif(typeof matter.draw!=='function')throw new Error('Installed particle volumes failed');\nconst generated=createGeneratedEffect2D(createGenerationPlan2D({material:'fire',action:'plume',seed:0xffffffff}),{composition:'volumes'});\nif(!generated.create(generated.meta.options))throw new Error('Installed volume generation failed');\nconst particles=createCinematicParticles2D({count:1,palette:['#fff'],life:.1,style:'ribbon',ribbonProfile:'wispy',flow});\nif(!particles.sample(.05).length)throw new Error('Installed shared flow failed');\nif(createGenerationStarter2D('ice').plan.intent.action!=='shatter')throw new Error('Installed material starter failed');\nconst waterPlan=createGenerationStarter2D('water').plan;if(waterPlan.intent.action!=='pour')throw new Error('Installed water starter failed');const water=createGeneratedEffect2D(waterPlan);if(!water.create(water.meta.options))throw new Error('Installed water generation failed');\nconst lightningPlan=createGenerationStarter2D('lightning').plan;if(lightningPlan.intent.action!=='strike')throw new Error('Installed lightning starter failed');const lightning=createGeneratedEffect2D(lightningPlan);if(!lightning.create(lightning.meta.options))throw new Error('Installed lightning generation failed');\nconst ice=createGeneratedEffect2D(createGenerationPlan2D({material:'ice',action:'shatter'}));\nif(!ice.create(ice.meta.options))throw new Error('Installed ice generation failed');const crystal=createGeneratedEffect2D(createGenerationPlan2D({material:'ice',action:'shatter'}),{iceSurface:'crystal'});if(!crystal.create(crystal.meta.options))throw new Error('Installed crystal surface failed');\nif(createFrame(2,3).color.length!==6||createFrame3D(2,3).color.length!==6)throw new Error('Installed ESM failed');\n`);
    run(work,[join(work,'smoke.mjs')]);
    writeFileSync(join(work,'fixture.project.json'),JSON.stringify({schema:'poku.project/v1',id:'projectiles/arrow',kind:'2d',seed:5,fps:4,seconds:.25,bg:'none',actor:false,target:false}));
    run(work,[join(installed,'tools/poku.mjs'),'render','--project',join(work,'fixture.project.json'),'--bundle','--max-texture','256','--trim','--deduplicate']);
    const manifest=JSON.parse(readFileSync(join(work,'records/projectiles/arrow/arrow.asset.json'),'utf8'));
    assert.equal(manifest.schema,'poku-asset/v1');assert.ok(manifest.frames.length>=1);assert.equal(existsSync(join(installed,'records')),false);
    run(work,[join(installed,'tools/poku.mjs'),'intent','init','test/workspace-fixture']);
    const brief=JSON.parse(readFileSync(join(work,'authoring/test/workspace-fixture.intent.json'),'utf8'));assert.equal(brief.intent.oneSentence,'');
    assert.equal(existsSync(join(installed,'authoring/test/workspace-fixture.intent.json')),false);
  }finally{rmSync(temp,{recursive:true,force:true});}
});
