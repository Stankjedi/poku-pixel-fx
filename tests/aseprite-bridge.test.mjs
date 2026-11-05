import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createAsepriteImportScript,exportAsepriteProject,importAsepriteFiles,emptyOutputDirectory,readAsepriteProject,createEditableAseprite} from '../build-tools/tools/lib/aseprite-bridge.mjs';
import {loadEffect,renderFrames} from '../build-tools/tools/lib/fxlib.mjs';
import {createSpriteClip2D,createFrame,painterFor} from '../build/core/index.js';

const project={format:'poku-aseprite-project',version:1,effectId:'test/fixture',width:3,height:2,pivot:[1,1],fps:30,durationsMs:[33,34,33],loop:false,tags:[{name:'all',from:0,to:2,direction:'forward'}],flattened:true,bakedEmission:true};
test('official Lua import preserves blank cells, milliseconds and tags and safely quotes tag data',()=>{
  const p=structuredClone(project);p.tags[0].name='\n한글"\\]]';
  const script=createAsepriteImportScript(p);
  assert.match(script,/SpriteSheetType\.ROWS/);
  assert.match(script,/frameBounds=Rectangle\(0,0,3,2\)/);
  assert.match(script,/local durations = \{33,34,33\}/);
  assert.match(script,/s:deleteFrame\(s\.frames\[i\]\)/);
  assert.match(script,/s\.frames\[i\]\.duration=\(ms\+0\.0001\)\/1000/);
  assert.match(script,/Aseprite did not preserve frame timing/);
  assert.match(script,/s:newTag\(1, 3\)/);
  assert.match(script,/tag\.name = "\\010\\237\\149\\156\\234\\184\\128\\034\\092\]\]"/);
  assert.match(script,/s:saveAs\(output\)/);
  assert.throws(()=>createAsepriteImportScript({...project,durationsMs:[0]}),/durations/);
  assert.throws(()=>createAsepriteImportScript({...project,durationsMs:[65536]}),/durations/);
  assert.throws(()=>createAsepriteImportScript({...project,tags:[{name:'bad',from:0,to:9,direction:'forward'}]}),/tag/);
});
test('actual engine RGBA export and runtime reimport preserve every pixel, pivot and balanced timing',async()=>{
  const root=mkdtempSync(join(tmpdir(),'poku-aseprite-'));
  try {
    const dir=join(root,'project'),output=join(root,'imported'),id='weather/rising-smoke',fps=7;
    const p=await exportAsepriteProject(id,dir,{fps});
    const original=renderFrames(await loadEffect(id),{fps,bg:'none',actor:false});
    const result=importAsepriteFiles(join(dir,'source.png'),join(dir,'source.json'),output,{name:'round-trip',loop:true});
    const clip=createSpriteClip2D(result.data,{loop:true});
    assert.deepEqual(clip.pivot,original.pivot);
    assert.equal(clip.frameCount,original.frames.length);
    assert.equal(p.durationsMs.reduce((a,b)=>a+b,0),4000);
    assert.deepEqual(new Set(p.durationsMs),new Set([142,143]));
    let elapsed=0,translucent=0;
    original.frames.forEach((frame,i)=>{
      const pixels=clip.framePixels(i),rgba=new Uint8Array(pixels.buffer);
      assert.deepEqual(rgba,new Uint8Array(frame.clear),`frame ${i}`);
      for(let j=3;j<rgba.length;j+=4)if(rgba[j]>0&&rgba[j]<255)translucent++;
      assert.equal(clip.frameAt((elapsed+0.5)/1000),i);
      elapsed+=p.durationsMs[i];
      const drawn=createFrame(clip.width,clip.height);
      clip.draw(painterFor(drawn).place(...clip.pivot),(elapsed-p.durationsMs[i]+0.5)/1000);
      assert.deepEqual(drawn.color,pixels,`runtime painter frame ${i}`);
      assert.ok(drawn.light.every(v=>v===0),'raster playback does not invent emission');
    });
    assert.ok(translucent>1000);
    assert.deepEqual(readAsepriteProject(dir),p);
    assert.match(readFileSync(join(output,'round-trip.ts'),'utf8'),/createSpriteClip2D/);
    assert.match(readFileSync(join(output,'round-trip.ts'),'utf8'),/tags:\["aseprite","raster","imported"\]/);
    assert.throws(()=>emptyOutputDirectory(dir),/Refusing to overwrite/);
    assert.throws(()=>importAsepriteFiles(join(dir,'source.png'),join(dir,'source.json'),output),/Refusing to overwrite/);
    // Existing documents are protected before the configured executable can run.
    writeFileSync(join(dir,'editable.aseprite'),'existing edits');
    assert.throws(()=>createEditableAseprite(dir,'/not/an/installed/aseprite'),/Refusing to overwrite edited/);
    assert.equal(readFileSync(join(dir,'editable.aseprite'),'utf8'),'existing edits');
    assert.deepEqual(readdirSync(dir).sort(),['README.txt','bridge.json','editable.aseprite','import.lua','source.json','source.png']);
  }finally{rmSync(root,{recursive:true,force:true});}
});
test('CLI rejects irrelevant flags instead of silently ignoring them',()=>{
  const cli=new URL('../build-tools/tools/aseprite.mjs',import.meta.url);
  const result=spawnSync(process.execPath,[cli.pathname,'export','weather/rising-smoke','--sheet','unused','--out','unused'],{encoding:'utf8'});
  assert.equal(result.status,1);assert.match(result.stderr,/--sheet is not supported by export/);
  const help=spawnSync(process.execPath,[cli.pathname,'--help'],{encoding:'utf8'});
  assert.equal(help.status,0);assert.match(help.stdout,/Aseprite/);
});
