#!/usr/bin/env node
import { parseGenerationPreviewArgs, previewGenerationHelp, writeGenerationPreview } from './lib/generation-preview.mjs';
try {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help', '-h'].includes(args[0])) console.log(previewGenerationHelp);
  else {
    const result = await writeGenerationPreview(parseGenerationPreviewArgs(args));
    console.log(`${result.manifest.candidates.length} explicit seed previews -> ${result.output}/manifest.json\nNative transparent sheets and reusable projects saved. No effect registered, no seed ranked, no visual review recorded. Create and complete a separate intent brief before the existing review workflow.`);
  }
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
