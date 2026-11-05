import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const directory = new URL('../src/render/shaders/', import.meta.url);
const files = readdirSync(directory).filter(n => n.endsWith('.wgsl')).sort();
const exports = files.map(name => `export const ${name.replace('.wgsl', '').replace(/-/g, '_').toUpperCase()}_WGSL = ${JSON.stringify(readFileSync(new URL(name, directory), 'utf8'))};`).join('\n');
const output = fileURLToPath(new URL('../src/render/wgsl.ts', import.meta.url));
writeFileSync(output, '// Generated from shaders/*.wgsl by tools/generate-wgsl.mjs. Native uses the same source files.\n' + exports + '\n');
