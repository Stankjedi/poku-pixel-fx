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
    for(const path of ['tools/poku.mjs','tools/effect-intent.mjs','tools/lib/effect-intent.mjs','build-tools/tools/render.mjs','build/authoring/project.js',
      'build-gallery/studio.js','build-gallery/studio-worker.js','gallery/studio.html','gallery/fonts/SUIT-Variable.woff2','src/fx/projectiles/arrow.ts','LICENSE','NOTICE.md'])assert.ok(paths.has(path),`release is missing ${path}`);
    writeFileSync(join(work,'package.json'),JSON.stringify({name:'synthetic-poku-consumer',version:'1.0.0',private:true,type:'module'}));
    run(work,[cli,'install','--ignore-scripts','--offline','--no-audit','--no-fund','--omit=dev',join(temp,packed.filename)]);
    const installed=join(work,'node_modules/poku-pixel-fx');
    assert.equal(existsSync(join(work,'node_modules/typescript')),false,'consumer never compiles the library');
    const help=run(work,[cli,'exec','--offline','--','poku-fx','--help']);assert.match(help.stdout,/POKU Pixel FX/);
    const version=run(work,[join(installed,'tools/poku.mjs'),'--version']);assert.equal(version.stdout.trim(),JSON.parse(readFileSync(join(root,'package.json'),'utf8')).version);
    writeFileSync(join(work,'smoke.mjs'),`import {createFrame} from 'poku-pixel-fx';\nimport {createFrame3D} from 'poku-pixel-fx/3d';\nif(createFrame(2,3).color.length!==6||createFrame3D(2,3).color.length!==6)throw new Error('Installed ESM failed');\n`);
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
