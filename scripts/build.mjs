import { spawn } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { rm,readFile,writeFile } from 'node:fs/promises';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const {version}=JSON.parse(await readFile(resolve(root,'package.json'),'utf8'));
const versionSource=`// Generated from package.json by scripts/build.mjs.\nexport const ENGINE_VERSION=${JSON.stringify(version)};\n`;
await writeFile(resolve(root,'src/version.ts'),versionSource);
async function node(file, args = []) {
  await new Promise((yes, no) => {
    const child = spawn(process.execPath, [resolve(root, file), ...args], { cwd: root, stdio: 'inherit' });
    child.on('error', no); child.on('exit', code => code === 0 ? yes() : no(new Error(`${file} exited ${code}`)));
  });
}
await node('tools/generate-wgsl.mjs');
await node('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.json']);
await node('scripts/generate-registry.mjs');
await node('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.json']);
await node('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.tools.json']);
await node('node_modules/typescript/bin/tsc', ['-p', 'tsconfig.gallery.json']);
await rm(resolve(root,'build-gallery'),{recursive:true,force:true});
const bundled=await build({
  absWorkingDir: root, entryPoints: ['gallery/app.ts', 'gallery/3d.ts', 'gallery/studio.ts', 'gallery/studio-worker.ts', 'gallery/gpu-lab.ts', 'gallery/gpu-lab-worker.ts'],
  bundle: true, format: 'esm', splitting: true, outdir: 'build-gallery', chunkNames: 'chunks/[name]-[hash]',
  target: 'es2022', logLevel: 'info', metafile: true,
});
const outputs=bundled.metafile.outputs;
const entries=Object.entries(outputs).filter(([,info])=>info.entryPoint&&/^gallery\/(app|3d|studio|studio-worker|gpu-lab|gpu-lab-worker)\.ts$/.test(info.entryPoint));
const initialBytes=(entry)=>{const visited=new Set();function visit(path){if(visited.has(path)||!outputs[path])return 0;visited.add(path);return outputs[path].bytes+outputs[path].imports.filter(i=>i.kind!=='dynamic-import'&&!i.external).reduce((n,i)=>n+visit(i.path),0);}return visit(entry);};
const report={schema:'poku.bundle-metrics/v1',unit:'uncompressed JavaScript bytes',entries:Object.fromEntries(entries.map(([path,info])=>[info.entryPoint,{entry:path,entryBytes:info.bytes,staticGraphBytes:initialBytes(path)}])),lazyModuleEntries:Object.values(outputs).filter(info=>info.entryPoint?.startsWith('src/fx/')).length};
await writeFile(resolve(root,'build-gallery/bundle-report.json'),JSON.stringify(report,null,2)+'\n');
