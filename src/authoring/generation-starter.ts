/** Bounded category examples for new source files. These do not interpret effect names. */
import { createGenerationPlan2D } from './generation.js';
import type { GenerationAction2D, GenerationMaterial2D, GenerationPlan2D } from './generation.js';

export interface GenerationStarter2D {
  readonly selection: 'category-example';
  readonly category: string;
  readonly label: string;
  readonly plan: GenerationPlan2D;
}
const recipes: Readonly<Record<string, Readonly<{
  material: GenerationMaterial2D; action: GenerationAction2D; label: string;
}>>> = Object.freeze({
  fire: Object.freeze({ material: 'fire', action: 'plume', label: 'Rooted rising fire plume' }),
  ice: Object.freeze({ material: 'ice', action: 'shatter', label: 'Solid crystal cracking into falling rigid pieces' }),
  water: Object.freeze({ material: 'water', action: 'pour', label: 'Falling water feeding a spreading shallow pool' }),
  lightning: Object.freeze({ material: 'lightning', action: 'strike', label: 'A branched electrical strike with a weaker same-channel repeat' }),
  scifi: Object.freeze({ material: 'energy', action: 'dash', label: 'Directed energy pulse, then dissipation' }),
});

/** Reuse the real material/action recipes instead of a generic source recolored by folder.
 * Returns undefined for an unmapped category. No prose, name parsing, loops or implicit impacts.
 * These are named starting examples, not the complete meaning of a category or requested subject. */
export function createGenerationStarter2D(category: string, seed = 1): GenerationStarter2D | undefined {
  if (typeof category !== 'string') throw new TypeError('Generation starter category must be a string');
  if (!Object.hasOwn(recipes, category)) return undefined;
  const recipe = recipes[category];
  return Object.freeze({ selection: 'category-example', category, label: recipe.label,
    plan: createGenerationPlan2D({ material: recipe.material, action: recipe.action, response: 'dissipate', seed }) });
}
