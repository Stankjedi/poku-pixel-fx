/** Portable authoring settings. No functions, runtime instances or review approvals are serialized. */
export type JSONValue = null | boolean | number | string | JSONValue[] | { [key: string]: JSONValue };
export type ProjectKind = '2d' | 'act' | '3d' | 'recipe' | 'character';
export interface ResolvedProject {
  schema: 'poku.project/v1';
  id: string;
  name: string;
  kind: ProjectKind;
  seed: number;
  options: Record<string, any>;
  fps: number;
  seconds?: number;
  bg: string;
  actor: boolean;
  target: boolean;
  hold?: number;
  margin?: number;
  pad?: number;
  cameraMotion?: number;
  intentRef?: string;
  intentSha256?: string;
  renderProfile?: Record<string, any>;
  pixelStyle?: Record<string, any>;
  recipe?: Record<string, any>;
  character?: Record<string, any>;
  layers: Record<string, boolean>;
  edits: JSONValue[];
  sourceRevision?: string;
  notes: string;
}
export type Project = ResolvedProject;

export function cloneJSON<T>(value: T): T {
  const seen = new Set<object>();
  function visit(v: unknown, depth: number): void {
    if (depth > 64) throw new RangeError('Project nesting exceeds 64 levels');
    if (v === null || typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'number' && Number.isFinite(v)) return;
    if (!v || typeof v !== 'object' || seen.has(v)) throw new TypeError('Project data must be finite, acyclic JSON');
    if (!Array.isArray(v) && Object.getPrototypeOf(v) !== Object.prototype && Object.getPrototypeOf(v) !== null)
      throw new TypeError('Runtime instances and typed arrays do not belong in project JSON');
    seen.add(v);
    for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'constructor', 'prototype'].includes(key)) throw new TypeError('Reserved project key');
      visit(child, depth + 1);
    }
    seen.delete(v);
  }
  visit(value, 0);
  return JSON.parse(JSON.stringify(value)) as T;
}

function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, any>;
}
function number(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const result = value === undefined ? fallback : value;
  if (typeof result !== 'number' || !Number.isFinite(result) || result < min || result > max) throw new RangeError(`Invalid ${label}`);
  return result;
}

/** Validate once on input. Unknown optional settings remain in their explicitly namespaced objects. */
export function resolveProject(input: unknown): ResolvedProject {
  const p = object(cloneJSON(input), 'Project');
  if (p.schema !== undefined && p.schema !== 'poku.project/v1') throw new RangeError('Unsupported project schema');
  if (typeof p.id !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(p.id)) throw new RangeError('Project id must be category/name');
  const kind: ProjectKind = p.kind ?? '2d';
  if (!['2d', 'act', '3d', 'recipe', 'character'].includes(kind)) throw new RangeError('Unknown project kind');
  const seed = number(p.seed ?? p.options?.seed, 1, 0, 0xffffffff, 'seed');
  if (!Number.isInteger(seed)) throw new RangeError('Seed must be an integer');
  const layers = object(p.layers ?? {}, 'layers');
  if (Object.values(layers).some(v => typeof v !== 'boolean')) throw new TypeError('Layer visibility must be boolean');
  if (!Array.isArray(p.edits ?? [])) throw new TypeError('edits must be an array');
  for (const key of ['actor', 'target']) if (p[key] !== undefined && typeof p[key] !== 'boolean') throw new TypeError(`${key} must be boolean`);
  for (const key of ['name', 'bg', 'notes', 'intentRef', 'intentSha256', 'sourceRevision'])
    if (p[key] !== undefined && typeof p[key] !== 'string') throw new TypeError(`${key} must be text`);
  const out: ResolvedProject = {
    schema: 'poku.project/v1', id: p.id, name: p.name ?? p.id, kind, seed,
    options: { ...object(p.options ?? {}, 'options'), seed },
    fps: number(p.fps, 30, 1, 240, 'fps'), bg: p.bg ?? 'dark',
    actor: p.actor ?? true, target: p.target ?? true,
    layers: { ...layers }, edits: p.edits ?? [], notes: p.notes ?? '',
  };
  for (const key of ['seconds', 'hold', 'margin', 'pad', 'cameraMotion'] as const) {
    if (p[key] !== undefined) out[key] = number(p[key], 0, 0, key === 'seconds' ? 3600 : 4096, key);
  }
  for (const key of ['renderProfile', 'pixelStyle', 'recipe', 'character'] as const)
    if (p[key] !== undefined) out[key] = object(p[key], key);
  for (const key of ['intentRef', 'intentSha256', 'sourceRevision'] as const)
    if (p[key] !== undefined) out[key] = p[key];
  return out;
}
export const createProject = (input: Partial<ResolvedProject> & { id: string }): ResolvedProject => resolveProject(input);
export function parseProject(json: string): ResolvedProject {
  if (json.length > 32 * 1024 * 1024) throw new RangeError('Project exceeds 32 MiB');
  return resolveProject(JSON.parse(json));
}
export const serializeProject = (project: unknown): string => JSON.stringify(resolveProject(project), null, 2) + '\n';

export interface RecipePack {
  schema: 'poku.recipe-pack/v1'; project: ResolvedProject;
  examples: { time: number; note: string }[]; lessons: string[];
  intent?: Record<string, JSONValue>;
}
/** Reuse authored settings and lessons, never transfer a previous review as approval of a new output. */
export function createRecipePack(project: unknown, examples: RecipePack['examples'] = [], lessons: string[] = []): RecipePack {
  if (examples.some(x => !Number.isFinite(x.time) || x.time < 0 || typeof x.note !== 'string')) throw new RangeError('Invalid example');
  if (lessons.some(x => typeof x !== 'string')) throw new TypeError('Lessons must be text');
  return { schema: 'poku.recipe-pack/v1', project: resolveProject(project), examples: cloneJSON(examples), lessons: [...lessons] };
}
