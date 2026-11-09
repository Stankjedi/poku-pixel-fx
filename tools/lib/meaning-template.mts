import { generationRenderOptions2D, type GenerationStyleSelection2D } from './generation-style.mjs';
import type { GenerationPlan2D } from '../../src/authoring/generation.js';

/** Serialize supported meaning as data; prose can never become executable template code. */
export function meaningTemplate(name: string, category: string, plan: GenerationPlan2D, addedAt = new Date().toISOString(), selection: GenerationStyleSelection2D = {}): string {
  const options = generationRenderOptions2D(plan, selection);
  const optionsSource = Object.keys(options).length ? ', { ' + Object.entries(options).map(([key, value]) => key + ': ' + JSON.stringify(value)).join(', ') + ' }' : '';
  return `// Structured generation: edit intent values and regenerate the plan, not independent event clocks.
import { createGenerationPlan2D, createGeneratedEffect2D } from "../../authoring/generation.js";

export const generation = createGenerationPlan2D(${JSON.stringify(plan.intent, null, 2)});
const effect = createGeneratedEffect2D(generation${optionsSource});
export const meta = { ...effect.meta, name: ${JSON.stringify(name)}, addedAt: ${JSON.stringify(addedAt)},
  tags: [...effect.meta.tags, ${JSON.stringify(category)}] };
export const events = effect.events;
export const create = effect.create;

// The source silhouette, release, arrival, emitted trails and requested response share this plan.
// This is a supported procedural composition, not a claim of unrestricted language understanding.
// Inspect native-size/full-speed output and complete the intent brief before marking it reviewed.
`;
}
