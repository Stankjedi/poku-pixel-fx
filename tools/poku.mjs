#!/usr/bin/env node
/** Cross-platform installed CLI. Every subprocess receives an argument array; no shell interpolation. */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const commands = {
  list: 'list', render: 'render', act: 'act', check: 'check', review: 'review', share: 'share',
  'render-3d': 'render-3d', 'render-3d-gif': 'render-3d-gif', aseprite: 'aseprite', gallery: 'serve', catalog: 'export-catalog',
};
const help = `POKU Pixel FX
  poku-fx list [category]
  poku-fx render category/effect --sheet --bundle [--out DIRECTORY]
  poku-fx render --project project.json --bundle --trim --deduplicate
  poku-fx act category/effect --bundle [--seconds N]
  poku-fx render-3d frost --bundle [--profile render-profile.json]
  poku-fx review --project project.json [--record completed-review.json]
  poku-fx share --project project.json
  poku-fx intent init|validate|prepare|record|check category/effect [--variant SHA256]
  poku-fx aseprite export category/effect --out DIRECTORY [--layers]
  poku-fx gallery [PORT]
  poku-fx check category/effect

Render and review files are created in the current workspace. Sharing prepares local files;
publication and rights declarations remain explicit user actions. GIF/MP4 require ffmpeg on PATH.
Aseprite create/pull require your own explicitly supplied --aseprite executable.
Use a source checkout to create/register procedural effect modules.
`;
const args = process.argv.slice(2), command = args.shift();
try {
  if (!command || ['help', '--help', '-h'].includes(command)) console.log(help);
  else if (['version', '--version', '-v'].includes(command)) console.log(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version);
  else {
    if (command !== 'intent' && !Object.hasOwn(commands, command)) throw new Error(`Unknown command: ${command}\nRun poku-fx --help.`);
    const entry = command === 'intent' ? new URL('./effect-intent.mjs', import.meta.url)
      : new URL(`../build-tools/tools/${commands[command]}.mjs`, import.meta.url);
    if (!existsSync(entry)) throw new Error('Compiled CLI files are missing. Build the source checkout or install a complete release package.');
    process.env.POKU_WORKSPACE ??= process.cwd();
    process.argv = [process.execPath, fileURLToPath(entry), ...args];
    await import(entry.href);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1;
}
