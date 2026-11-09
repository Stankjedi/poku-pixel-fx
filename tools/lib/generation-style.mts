/** Explicit artwork selection shared by new and preview-generation.
 * Omission retains the exact established creation policy. Never infer a style from a name. */
import type { GenerationCompositionOptions2D, GenerationPlan2D } from '../../src/authoring/generation.js';
const { createGeneratedEffect2D } = await import(new URL('../../../build/authoring/generation.js', import.meta.url).href);

export interface GenerationStyleSelection2D {
  fireSparks?: 'short-exposure';
  fireSparkCount?: number;
  fireSparkLight?: number;
  fireSparkFinish?: 'scintillation';
}
export const generationStyleFlags = Object.freeze(['--fire-sparks', '--fire-spark-count', '--fire-spark-light', '--fire-spark-finish'] as const);

function number(value: string, flag: string, max: number, integer = false): number {
  if (typeof value !== 'string' || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value))
    throw new TypeError(`${flag} must be a finite decimal number`);
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0 || result > max || (integer && !Number.isInteger(result)))
    throw new RangeError(`${flag} must be ${integer ? 'an integer' : 'finite'} from 0 to ${max}`);
  return result;
}

export function parseGenerationStyle2D(flags: Readonly<Record<string, string>>): GenerationStyleSelection2D {
  if (!flags || typeof flags !== 'object' || Array.isArray(flags)
    || Object.keys(flags).some(k => !(generationStyleFlags as readonly string[]).includes(k))) throw new RangeError('Unknown generation style flag');
  if (!Object.keys(flags).length) return {};
  if (!Object.hasOwn(flags, '--fire-sparks') || flags['--fire-sparks'] !== 'short-exposure')
    throw new RangeError('--fire-sparks supports only short-exposure and is required for spark controls');
  const selection: GenerationStyleSelection2D = { fireSparks: 'short-exposure' };
  if (Object.hasOwn(flags, '--fire-spark-count')) selection.fireSparkCount = number(flags['--fire-spark-count'], '--fire-spark-count', 720, true);
  if (Object.hasOwn(flags, '--fire-spark-light')) selection.fireSparkLight = number(flags['--fire-spark-light'], '--fire-spark-light', 2);
  if (Object.hasOwn(flags, '--fire-spark-finish')) {
    if (flags['--fire-spark-finish'] !== 'scintillation') throw new RangeError('--fire-spark-finish supports only scintillation');
    selection.fireSparkFinish = 'scintillation';
  }
  return selection;
}

/** Return a fresh immutable option record; factory validation enforces supported material/action/response. */
export function generationRenderOptions2D(plan: GenerationPlan2D, selection: GenerationStyleSelection2D = {}): Readonly<GenerationCompositionOptions2D> {
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)
    || Object.keys(selection).some(k => !['fireSparks', 'fireSparkCount', 'fireSparkLight', 'fireSparkFinish'].includes(k))
    || (selection.fireSparks !== undefined && selection.fireSparks !== 'short-exposure')) throw new RangeError('Invalid generation style selection');
  const options: GenerationCompositionOptions2D = ['fire', 'energy'].includes(plan.intent.material)
    && plan.intent.action !== 'burst' && plan.intent.response === 'dissipate' ? { composition: 'material-volumes' } : {};
  if (selection.fireSparks !== undefined) options.fireSparks = selection.fireSparks;
  if (selection.fireSparkCount !== undefined) options.fireSparkCount = selection.fireSparkCount;
  if (selection.fireSparkLight !== undefined) options.fireSparkLight = selection.fireSparkLight;
  if (selection.fireSparkFinish !== undefined) options.fireSparkFinish = selection.fireSparkFinish;
  // No emitter allocation: this only resolves/validates the plan and factory options.
  createGeneratedEffect2D(plan, options);
  return Object.freeze(options);
}
