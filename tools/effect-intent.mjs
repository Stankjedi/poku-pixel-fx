#!/usr/bin/env node
// Run directly with Node 18+. No build, browser, network or third-party package is required.
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createIntentBrief, readIntentBrief, prepareIntentReview, recordIntentReview, requireIntentReview } from './lib/effect-intent.mjs';

const args = process.argv.slice(2); let root = fileURLToPath(new URL('../', import.meta.url));
const rootAt = args.indexOf('--root');
if (rootAt !== -1) {
  if (!args[rootAt + 1]) { console.error('--root needs a path'); process.exit(1); }
  root = resolve(args[rootAt + 1]); args.splice(rootAt, 2);
}
const [command, id, file, ...extra] = args;
try {
  if (extra.length || !['init', 'validate', 'prepare', 'record', 'check'].includes(command)
    || !id || (command === 'record' ? !file : file !== undefined))
    throw Error('Usage: node tools/effect-intent.mjs init|validate|prepare|check category/effect [--root path]\n       node tools/effect-intent.mjs record category/effect completed-review.json [--root path]');
  let result;
  if (command === 'init') result = { ...createIntentBrief(root, id), notice: 'Unfilled draft. Not an artistic or physical approval.' };
  if (command === 'validate') { readIntentBrief(root, id); result = { status: 'brief-structure-valid', notice: 'Only authored fields/time ranges were checked. Render and inspect next.' }; }
  if (command === 'prepare') result = prepareIntentReview(root, id);
  if (command === 'record') result = recordIntentReview(root, id, resolve(file));
  if (command === 'check') {
    const checked = requireIntentReview(root, id);
    result = { status: 'matching-reviewer-record', reviewer: checked.review.reviewer, userApproval: checked.review.userApproval,
      notice: 'Record/evidence hashes match. This is not automatic aesthetic/physics certification; share re-renders to check current output.' };
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) { console.error(`Effect intent: ${error instanceof Error ? error.message : error}`); process.exitCode = 1; }
