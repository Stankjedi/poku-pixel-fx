import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const { effects } = await import(new URL('../build/fx/index.js', import.meta.url));
const entries = Object.entries(effects).sort(([a], [b]) => a.localeCompare(b)).map(([id, mod]) => ({
  id, category: id.split('/')[0], hasAct: !!mod.act,
  meta: { fps: 30, bg: 'dark', loop: false, duration: 1, tags: [], options: {}, ...mod.meta },
}));
const source = '// Generated from the runtime registry by scripts/generate-registry.mjs.\n'
  + 'export const catalogEntries: readonly {id:string;category:string;hasAct:boolean;meta:Record<string,any>}[] = '
  + JSON.stringify(entries, null, 2) + ';\n\n'
  + 'export const effectLoaders: Record<string,()=>Promise<any>> = {\n'
  + entries.map(({id}) => `  ${JSON.stringify(id)}: () => import(${JSON.stringify('../fx/' + id + '.js')}),`).join('\n')
  + '\n};\n';
await mkdir(resolve(root, 'src/authoring'), { recursive: true });
const path = resolve(root, 'src/authoring/catalog.generated.ts');
let previous; try { previous = await readFile(path, 'utf8'); } catch {}
if (source !== previous) await writeFile(path, source);
console.log(`Registry: ${entries.length} effects; lazy metadata and module loaders synchronized.`);
