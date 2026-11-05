import { cloneJSON } from './project.js';
export type Invalidation = 'frame' | 'simulation' | 'asset';
export type Parameter = {
  key: string; label: string; group?: string; type: 'number' | 'boolean' | 'enum' | 'color' | 'color-ramp' | 'curve' | 'asset-ref';
  default: unknown; min?: number; max?: number; step?: number; unit?: string;
  choices?: readonly (string | number)[]; invalidates: Invalidation; randomize?: boolean; protected?: boolean;
};
export function resolveParameters(schema: readonly Parameter[], supplied: Record<string, unknown> = {}): Record<string, any> {
  const out: Record<string, any> = {};
  for (const p of schema) {
    const v = supplied[p.key] ?? p.default;
    if (p.type === 'number' && (typeof v !== 'number' || !Number.isFinite(v) || v < (p.min ?? -Infinity) || v > (p.max ?? Infinity)))
      throw new RangeError(`${p.label}: expected ${p.min ?? '-∞'}..${p.max ?? '∞'} ${p.unit ?? ''}`);
    if (p.type === 'boolean' && typeof v !== 'boolean') throw new TypeError(`${p.label}: expected boolean`);
    if (p.type === 'enum' && !p.choices?.includes(v as string)) throw new RangeError(`${p.label}: unknown choice`);
    if (p.type === 'color' && (typeof v !== 'string' || !/^#[\da-f]{6}$/i.test(v))) throw new RangeError(`${p.label}: expected #RRGGBB`);
    if (p.type === 'color-ramp' && (!Array.isArray(v) || !v.length || v.some(x => typeof x !== 'string' || !/^#[\da-f]{6}$/i.test(x))))
      throw new RangeError(`${p.label}: expected a color ramp`);
    if (p.type === 'curve' && (!Array.isArray(v) || v.length < 2 || v.some((k, i) => !k || !Number.isFinite(k.time) || !Number.isFinite(k.value) || (i > 0 && k.time <= v[i - 1].time))))
      throw new RangeError(`${p.label}: curve times must increase`);
    if (p.type === 'asset-ref' && typeof v !== 'string') throw new TypeError(`${p.label}: expected asset id`);
    out[p.key] = cloneJSON(v);
  }
  return out;
}
export function invalidationFor(schema: readonly Parameter[], before: Record<string, unknown>, after: Record<string, unknown>): Invalidation {
  let result: Invalidation = 'frame';
  for (const p of schema) if (JSON.stringify(before[p.key]) !== JSON.stringify(after[p.key])) {
    if (p.invalidates === 'asset') return 'asset';
    if (p.invalidates === 'simulation') result = 'simulation';
  }
  return result;
}
