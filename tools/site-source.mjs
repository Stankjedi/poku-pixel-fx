import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/** Hash deploy inputs, not build products or the commit that will contain the manifest. */
export function sourceFingerprint(root) {
  const files = [];
  const walk = dir => {
    for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
      const path = `${dir}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (entry.isFile()) files.push(path);
    }
  };
  for (const dir of ['src', 'gallery', 'tools']) walk(dir);
  if (existsSync(join(root, 'scripts'))) walk('scripts');
  files.push(...readdirSync(root).filter(name => /^(package(?:-lock)?\.json|tsconfig(?:\.[a-z]+)?\.json)$/.test(name)));
  const hash = createHash('sha256');
  for (const path of files.sort()) hash.update(path).update('\0').update(readFileSync(join(root, path))).update('\0');
  return hash.digest('hex');
}
