import type { GenerationIntent2D } from '../../src/authoring/generation.js';

type GenerationControls2D = Pick<GenerationIntent2D, 'seed' | 'distance' | 'travel'>;
const names = { '--seed': 'seed', '--distance': 'distance', '--travel': 'travel' } as const;

/** Convert explicit CLI numbers only. The generation planner owns range/action validation.
 * No defaults, random seeds, clamping, name interpretation or template fallback. */
export function parseGenerationControls2D(input: Readonly<Record<string, string>>): GenerationControls2D {
  const result: GenerationControls2D = {};
  for (const [flag, value] of Object.entries(input)) {
    if (!Object.hasOwn(names, flag)) throw new RangeError(`Unsupported generation control: ${flag}`);
    // Number('') and Number('0x10') must not silently turn malformed CLI input into intent.
    if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value)
      || !Number.isFinite(Number(value))) throw new TypeError(`${flag} must be a finite decimal number`);
    result[names[flag as keyof typeof names]] = Number(value);
  }
  return result;
}
