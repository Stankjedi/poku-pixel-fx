// Creation controls are workflow fidelity, not a material-quality assertion.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseGenerationControls2D } from '../build-tools/tools/lib/generation-controls.mjs';
import { createGenerationPlan2D } from '../build/authoring/generation.js';
const root = fileURLToPath(new URL('../', import.meta.url));

test('explicit decimal controls preserve supplied values without defaults, clamping or seed substitution', () => {
  assert.deepEqual(parseGenerationControls2D({}), {});
  assert.deepEqual(parseGenerationControls2D({'--seed':'0','--distance':'24','--travel':'.25'}), {seed:0,distance:24,travel:.25});
  assert.deepEqual(parseGenerationControls2D({'--seed':'4294967295','--distance':'160','--travel':'3'}), {seed:0xffffffff,distance:160,travel:3});
  for (const value of ['', ' ', 'NaN', 'Infinity', '0x10', '3junk', '1e999'])
    assert.throws(() => parseGenerationControls2D({'--travel':value}));
  assert.throws(() => parseGenerationControls2D({'--speed':'4'}));
  for (const controls of [{'--seed':'-1'}, {'--seed':'1.2'}, {'--seed':'4294967296'}, {'--distance':'23.99'}, {'--distance':'160.01'}, {'--travel':'.249'}, {'--travel':'3.01'}])
    assert.throws(() => createGenerationPlan2D({material:'energy',action:'dash',...parseGenerationControls2D(controls)}));
});

test('compiled new CLI persists controls and rejects unsupported/malformed/repeated requests before any write', {timeout:60000}, () => {
  const temp = mkdtempSync(join(tmpdir(), 'poku-generation-controls-'));
  try {
    for (const dir of ['src','build','build-tools']) cpSync(join(root,dir),join(temp,dir),{recursive:true});
    for (const file of ['package.json','tools/lib/effect-intent.mjs']) {
      mkdirSync(join(temp,file,'..'),{recursive:true}); cpSync(join(root,file),join(temp,file));
    }
    // A caller workspace is a supported route: source/registry stay with the CLI package;
    // intent and companion plan belong to the caller. Both must remain untouched on rejection.
    const workspace = join(temp,'caller'); mkdirSync(workspace);
    const run = (id, flags=[]) => spawnSync(process.execPath,['build-tools/tools/new.mjs',id,...flags],
      {cwd:temp,env:{...process.env,POKU_WORKSPACE:workspace},encoding:'utf8',timeout:10000});
    const snapshot = () => {
      const files = {};
      const walk = path => { if (!existsSync(path)) return; for (const ent of readdirSync(path,{withFileTypes:true})) {
        const p = join(path,ent.name); if(ent.isDirectory()) walk(p); else files[p.slice(temp.length)]=readFileSync(p).toString('base64');
      }};
      walk(join(temp,'src/fx')); walk(join(workspace,'authoring')); return files;
    };
    const ok = (id, flags, intent) => {
      const r = run(id,flags); assert.equal(r.status,0,r.stdout+r.stderr); assert.equal(r.signal,null);
      const saved = JSON.parse(readFileSync(join(workspace,'authoring',id+'.generation.json')));
      assert.deepEqual(saved,createGenerationPlan2D(intent));
      const source=readFileSync(join(temp,'src/fx',id+'.ts'),'utf8');
      const encoded=JSON.parse(source.match(/createGenerationPlan2D\((\{[\s\S]*?\})\);/)[1]);
      assert.deepEqual(encoded,saved.intent);
      assert.equal(JSON.parse(readFileSync(join(workspace,'authoring',id+'.intent.json'))).intent.oneSentence,'');
      assert.equal(existsSync(join(temp,'authoring',id+'.generation.json')),false);
      const before=snapshot(); assert.equal(run(id,flags).status,1); assert.deepEqual(snapshot(),before);
    };
    ok('scifi/requested-pulse',['--seed','17','--distance','64','--travel','.45'],{material:'energy',action:'dash',seed:17,distance:64,travel:.45});
    ok('fire/requested-dash',['--material','화염','--action','돌진','--response','폭발','--seed','0','--distance','144','--travel','1.2'],{material:'fire',action:'dash',response:'burst',seed:0,distance:144,travel:1.2});
    ok('ice/requested-break',['--seed','4294967295'],{material:'ice',action:'shatter',seed:0xffffffff});
    const invalid = [
      ['scifi/bad',['--seed']], ['scifi/bad',['--seed','1','--seed','2']],
      ['scifi/bad',['--distance','64','--distance','80']], ['scifi/bad',['--travel','.45','--travel','1']],
      ...['',' ', 'NaN','Infinity','0x10','3junk','-1','1.2','4294967296'].map(v=>['scifi/bad',['--seed',v]]),
      ...['23','161'].map(v=>['scifi/bad',['--distance',v]]),
      ...['.24','3.1'].map(v=>['scifi/bad',['--travel',v]]),
      ...['--minimal','--timing','--cinematic','--loop'].map(v=>['scifi/bad',['--seed','17',v]]),
      ['arcane/bad',['--seed','17']], ['fire/bad',['--distance','64']], ['ice/bad',['--travel','1']],
      ['water/bad',['--distance','64']], ['lightning/bad',['--travel','1']],
      ['scifi/bad',['--action','dash','--seed','17']],
      ['fire/bad',['--material','fire','--action','burst','--distance','64']],
      ['scifi/bad',['--travel=.45']], ['scifi/bad',['--distance','--seed','17']],
    ];
    for(const [id,flags] of invalid) {
      const before=snapshot(),r=run(id,flags); assert.equal(r.status,1,JSON.stringify(flags)+r.stdout+r.stderr);
      assert.equal(r.signal,null); assert.deepEqual(snapshot(),before,JSON.stringify(flags));
    }
    const protectedPlan=join(workspace,'authoring/scifi/protected.generation.json');
    writeFileSync(protectedPlan,'{"keep":"existing plan"}\n');
    let before=snapshot(); assert.equal(run('scifi/protected',['--distance','64']).status,1); assert.deepEqual(snapshot(),before);
    const legacy=join(temp,'src/fx/scifi/legacy.js'); writeFileSync(legacy,'// keep legacy source\n');
    before=snapshot(); assert.equal(run('scifi/legacy',['--seed','17']).status,1); assert.deepEqual(snapshot(),before);
    const registry=join(temp,'src/fx/index.ts'); writeFileSync(registry,readFileSync(registry,'utf8').replace('export const effects = {','export const effectsChanged = {'));
    before=snapshot(); assert.equal(run('scifi/no-marker',['--seed','17']).status,1); assert.deepEqual(snapshot(),before);
  } finally { rmSync(temp,{recursive:true,force:true}); }
});
