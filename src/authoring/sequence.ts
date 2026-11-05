import { chain, type ChainCue } from '../core/chain.js';
import { resolveOptions, type EffectModule, type EffectOptions } from '../core/fx.js';
import { defineImpactContact2D, transformImpactContact2D, type ImpactContact2D } from '../core/impact-contact.js';
import { characterClipTime2D } from '../core/character-animation.js';
import { collectAssetEvents, exportLayout2D, transformExportSockets, type AssetSocket } from '../render/export.js';
import { cloneJSON } from './project.js';
import { createRecipeEffect, resolveRecipe, type RecipeSpec } from './recipes.js';
import { createCharacterEffect } from './character-effect.js';
import { loadCatalogEffect } from './registry.js';

export type SequenceSource =
  | { kind: 'catalog'; id: string }
  | { kind: 'recipe'; recipe: RecipeSpec }
  | { kind: 'character'; character: Record<string, any>; clip?: string };

/** Positions and angles are relative to the sequence pivot, in native pixels/radians. */
export interface SequenceCue {
  id: string;
  source: SequenceSource;
  at: number;
  /** Explicit visible window. One-shots still end at their natural source duration. */
  duration?: number;
  x: number; y: number; angle: number; flip: boolean;
  fadeIn: number; fadeOut: number;
  enabled: boolean;
  /** Omit to derive a stable seed from this cue id and the parent project seed. */
  seed?: number;
  options: Record<string, any>;
}
export interface SequenceSpec {
  schema: 'poku.sequence/v1';
  /** Omit to fit the end of the last cue; setting it explicitly crops/extends the timeline. */
  duration?: number;
  loop: boolean;
  /** Omit both to fit the union of transformed child canvases. */
  size?: [number, number]; origin?: [number, number];
  cues: SequenceCue[];
}
export type SequenceCueInput = Pick<SequenceCue, 'id' | 'source'> & Partial<Omit<SequenceCue, 'id' | 'source'>>;
export type SequenceInput = Omit<Partial<SequenceSpec>, 'cues'> & { cues?: SequenceCueInput[] };

function object(value: unknown, label: string): Record<string, any> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, any>;
}
function finite(value: unknown, fallback: number, min: number, max: number, label: string): number {
  const n = value ?? fallback;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) throw new RangeError(`Invalid sequence ${label}`);
  return n;
}
function boolean(value: unknown, fallback: boolean, label: string): boolean {
  if (value !== undefined && typeof value !== 'boolean') throw new TypeError(`Sequence ${label} must be boolean`);
  return value === undefined ? fallback : value as boolean;
}
function seed(value: unknown): number | undefined {
  if (value === undefined) return;
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('Sequence seed must be uint32');
  return value;
}

/** Resolve input once; only JSON data, never executable source text, is stored in a sequence. */
export function createSequenceSpec(input: SequenceInput = {}): SequenceSpec {
  const p = object(cloneJSON(input), 'Sequence');
  if (p.schema !== undefined && p.schema !== 'poku.sequence/v1') throw new RangeError('Unsupported sequence schema');
  if (!Array.isArray(p.cues ?? []) || (p.cues?.length ?? 0) > 64) throw new RangeError('A sequence supports at most 64 cues');
  const ids = new Set<string>();
  const cues: SequenceCue[] = (p.cues ?? []).map((value: unknown) => {
    const c = object(value, 'Sequence cue');
    if (typeof c.id !== 'string' || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(c.id) || ids.has(c.id))
      throw new RangeError('Sequence cue ids must be unique simple identifiers');
    ids.add(c.id);
    const raw = object(c.source, 'Sequence source');
    let source: SequenceSource;
    if (raw.kind === 'catalog') {
      if (typeof raw.id !== 'string' || !/^[a-z0-9-]+\/[a-z0-9-]+$/.test(raw.id)) throw new RangeError('Sequence catalog id must be category/name');
      source = { kind: 'catalog', id: raw.id };
    } else if (raw.kind === 'recipe') source = { kind: 'recipe', recipe: resolveRecipe(raw.recipe) };
    else if (raw.kind === 'character') {
      if (raw.clip !== undefined && (typeof raw.clip !== 'string' || !raw.clip)) throw new TypeError('Character cue clip must be text');
      source = { kind: 'character', character: object(raw.character, 'Character cue asset'), ...(raw.clip === undefined ? {} : { clip: raw.clip }) };
    } else throw new RangeError('Sequence sources must be catalog, recipe or character assets');
    const options = { ...object(c.options ?? {}, 'Sequence cue options') };
    // Canonical fields win. Accept imported project options without leaving two conflicting placements.
    const x = finite(c.x ?? options.x, 0, -65536, 65536, 'x'), y = finite(c.y ?? options.y, 0, -65536, 65536, 'y');
    const angle = finite(c.angle ?? options.angle, 0, -1e6, 1e6, 'angle');
    const flip = boolean(c.flip ?? options.flip, false, 'flip'), selectedSeed = seed(c.seed ?? options.seed);
    for (const key of ['x', 'y', 'angle', 'flip', 'seed']) delete options[key];
    const at = finite(c.at, 0, 0, 3600, 'start');
    const duration = c.duration === undefined ? undefined : finite(c.duration, 1, 1e-6, 3600, 'cue duration');
    return { id: c.id, source, at, ...(duration === undefined ? {} : { duration }), x, y, angle, flip,
      fadeIn: finite(c.fadeIn, 0, 0, 3600, 'fade-in'), fadeOut: finite(c.fadeOut, 0, 0, 3600, 'fade-out'),
      enabled: boolean(c.enabled, true, 'visibility'), ...(selectedSeed === undefined ? {} : { seed: selectedSeed }), options };
  });
  const duration = p.duration === undefined ? undefined : finite(p.duration, 1, 1e-6, 3600, 'duration');
  if ((p.size === undefined) !== (p.origin === undefined)) throw new RangeError('Sequence size and origin must be supplied together');
  if (p.size !== undefined && (!Array.isArray(p.size) || p.size.length !== 2 || !p.size.every((v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v > 0 && v <= 8192)
    || !Array.isArray(p.origin) || p.origin.length !== 2 || !p.origin.every((v: unknown) => typeof v === 'number' && Number.isFinite(v))))
    throw new RangeError('Invalid sequence canvas');
  return { schema: 'poku.sequence/v1', loop: boolean(p.loop, false, 'loop'), cues,
    ...(duration === undefined ? {} : { duration }), ...(p.size === undefined ? {} : { size: p.size, origin: p.origin }) };
}
export function resolveSequence(input: unknown): SequenceSpec {
  const p = object(input, 'Sequence');
  if (p.schema !== 'poku.sequence/v1') throw new RangeError('Unsupported sequence schema');
  return createSequenceSpec(p);
}

/** FNV-1a with an avalanche; independent of cue order, visibility and cache history. */
export function sequenceCueSeed(parentSeed: number, cueId: string): number {
  seed(parentSeed);
  let hash = (2166136261 ^ parentSeed) >>> 0;
  for (let i = 0; i < cueId.length; i++) hash = Math.imul(hash ^ cueId.charCodeAt(i), 16777619) >>> 0;
  hash = Math.imul(hash ^ hash >>> 16, 0x7feb352d);
  hash = Math.imul(hash ^ hash >>> 15, 0x846ca68b);
  return (hash ^ hash >>> 16) >>> 0;
}

type SourceModule = EffectModule & {
  meta: { size: readonly number[]; origin: readonly number[]; duration: number; loop?: boolean; cues?: readonly Record<string, unknown>[]; [key: string]: any };
  socketsAt?: (time: number, options: EffectOptions) => Record<string, AssetSocket> | undefined;
  events?: readonly Record<string, unknown>[];
  act?: { hits?: readonly Record<string, unknown>[] };
};
interface LoadedCue { cue: SequenceCue; mod: SourceModule; end: number }

function cueOptions(cue: SequenceCue, parent: EffectOptions): EffectOptions {
  return { ...(parent.palette === undefined ? {} : { palette: parent.palette }), ...cue.options,
    seed: cue.seed ?? sequenceCueSeed(Number(parent.seed ?? 1), cue.id), x: cue.x, y: cue.y, angle: cue.angle, flip: cue.flip };
}
function visible(cue: SequenceCue, options: EffectOptions): boolean {
  return cue.enabled && (options.layers as Record<string, boolean> | undefined)?.[cue.id] !== false;
}
function childTime(time: number, source: LoadedCue): number {
  const local = time - source.cue.at;
  return source.mod.meta.loop ? characterClipTime2D(local, source.mod.meta.duration, true).time : local;
}
function envelope(time: number, cue: SequenceCue, end: number): number {
  const smooth = (n: number) => { const u = Math.max(0, Math.min(1, n)); return u * u * (3 - 2 * u); };
  return (cue.fadeIn ? smooth((time - cue.at) / cue.fadeIn) : 1) * (cue.fadeOut ? smooth((end - time) / cue.fadeOut) : 1);
}

/** Event clocks follow the exact cue window; repeated loop events are explicit within one sequence cycle. */
function sourceTimes(source: LoadedCue, at: number): number[] {
  if (!Number.isFinite(at) || at < 0) return [];
  const { cue, mod, end } = source, duration = mod.meta.duration;
  if (mod.meta.loop && at >= duration - 1e-9) return [];
  const result: number[] = [];
  const naturalEnd = !mod.meta.loop && Math.abs(end - (cue.at + duration)) < 1e-9;
  for (let cycle = 0; ; cycle++) {
    const time = cue.at + at + cycle * duration;
    if (time > end + 1e-9 || (!naturalEnd && time >= end - 1e-9)) break;
    result.push(time);
    if (!mod.meta.loop) break;
    if (result.length >= 100_000) throw new RangeError('Sequence contains over 100,000 repeated events; shorten the cue window');
  }
  return result;
}

/** Compile once, then reuse the same deterministic scheduler in Studio, CLI and atlas export. */
export async function createSequenceEffect(input: unknown, loader: (id: string) => Promise<any> = loadCatalogEffect, fps = 30) {
  if (!Number.isFinite(fps) || fps < 1 || fps > 240) throw new RangeError('Sequence fps must be in [1, 240]');
  const spec = resolveSequence(input);
  const loaded = await Promise.all(spec.cues.map(async cue => {
    const mod: SourceModule = cue.source.kind === 'catalog' ? await loader(cue.source.id)
      : cue.source.kind === 'recipe' ? createRecipeEffect(cue.source.recipe)
      : createCharacterEffect(cue.source.character, cue.source.clip, fps);
    const meta = mod.meta;
    if (!meta || !Number.isFinite(meta.duration) || meta.duration <= 0 || meta.duration > 3600)
      throw new RangeError(`Sequence cue ${cue.id} needs a positive finite source duration`);
    // Validate authored pixel-edge bounds before using them to fit a sequence canvas.
    exportLayout2D(meta.size, meta.origin, cue);
    const window = cue.duration ?? meta.duration, span = meta.loop ? window : Math.min(window, meta.duration);
    return { cue, mod, end: cue.at + span };
  }));
  const duration = spec.duration ?? (loaded.length ? Math.max(...loaded.map(c => c.end)) : 1);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 3600) throw new RangeError('Sequence duration must be in (0, 3600]');
  for (const source of loaded) source.end = Math.min(source.end, duration);
  let size: [number, number], origin: [number, number];
  if (spec.size && spec.origin) { size = [...spec.size]; origin = [...spec.origin]; }
  else if (!loaded.length) { size = [320, 180]; origin = [160, 144]; }
  else {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const { cue, mod } of loaded) {
      const layout = exportLayout2D(mod.meta.size, mod.meta.origin, { angle: cue.angle, flip: cue.flip });
      const x = cue.x - layout.pivot[0], y = cue.y - layout.pivot[1];
      left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x + layout.w); bottom = Math.max(bottom, y + layout.h);
    }
    left = Math.floor(left); top = Math.floor(top); right = Math.ceil(right); bottom = Math.ceil(bottom);
    size = [Math.max(1, right - left), Math.max(1, bottom - top)]; origin = [-left, -top];
  }
  if (size[0] > 8192 || size[1] > 8192 || size[0] * size[1] > 4_194_304) throw new RangeError('Sequence canvas exceeds 8192px or four megapixels; move cues closer or set a smaller explicit canvas');

  const metadataFor = (options: EffectOptions) => {
    const contacts: ImpactContact2D[] = [], events: Record<string, unknown>[] = [];
    for (const source of loaded) {
      const { cue, mod } = source;
      if (!visible(cue, options) || source.end <= cue.at) continue;
      const actual = resolveOptions(mod.meta, cueOptions(cue, options));
      for (const contact of mod.contacts?.(actual) ?? []) for (const at of sourceTimes(source, contact.at)) {
        if (spec.loop && at >= duration - 1e-9) continue;
        contacts.push(transformImpactContact2D(defineImpactContact2D({ ...contact, id: `${cue.id}/${contact.id}`, at }), cue));
      }
      for (const event of collectAssetEvents(mod)) {
        const sourceTime = Number(event.sourceTime ?? event.t ?? event.at ?? event.time);
        if (!Number.isFinite(sourceTime)) throw new RangeError(`Sequence cue ${cue.id} has an event without a finite source time`);
        for (const at of sourceTimes(source, sourceTime)) {
          if (spec.loop && at >= duration - 1e-9) continue;
          const id = String(event.id ?? event.name ?? event.kind ?? event.type ?? 'event');
          events.push({ ...event, id: `${cue.id}/${id}`, sourceTime: at, at, cue: cue.id, cueSourceTime: sourceTime,
            ...(typeof event.socket === 'string' ? { socket: `${cue.id}/${event.socket}` } : {}) });
        }
      }
      if (contacts.length + events.length > 100_000) throw new RangeError('Sequence metadata exceeds 100,000 markers; shorten cue windows');
    }
    contacts.sort((a, b) => a.at - b.at); events.sort((a, b) => Number(a.sourceTime) - Number(b.sourceTime));
    return { contacts, events };
  };
  const meta = { name: 'Effect Sequence', desc: 'Timed catalog, recipe and character cues in one native canvas.',
    size, origin, duration, loop: spec.loop, fps, bg: 'dark', tags: ['sequence'], options: { seed: 1 },
    heroTime: loaded.length ? Math.min(duration, loaded[0].cue.at + Number(loaded[0].mod.meta.heroTime ?? .25)) : 0 };
  const clock = (time: number) => characterClipTime2D(time, duration, spec.loop);
  return {
    meta, sequence: spec,
    contacts: (options: EffectOptions) => metadataFor(options).contacts,
    // Events depend on source windows and visibility, not on random particle draws. Runtime/export
    // replace this default list with eventsFor(options) when project layer visibility is applied.
    events: metadataFor({ seed: 1 }).events,
    eventsFor: (options: EffectOptions) => metadataFor(options).events,
    socketsAt(time: number, options: EffectOptions = {}) {
      const t = clock(time).time;
      const sockets: Record<string, AssetSocket> = Object.create(null);
      for (const source of loaded) {
        const { cue, mod, end } = source;
        if (!visible(cue, options) || t < cue.at || t >= end || envelope(t, cue, end) <= 0) continue;
        const actual = resolveOptions(mod.meta, cueOptions(cue, options));
        const posed = transformExportSockets(mod.socketsAt?.(childTime(t, source), actual), mod.meta.origin,
          [origin[0] + cue.x, origin[1] + cue.y], cue);
        for (const [name, socket] of Object.entries(posed ?? {})) sockets[`${cue.id}/${name}`] = socket;
      }
      return sockets;
    },
    cameraShake(time: number, options: EffectOptions) {
      const t = clock(time).time;
      let x = 0, y = 0;
      for (const source of loaded) {
        const { cue, mod, end } = source;
        if (!mod.cameraShake || !visible(cue, options) || t < cue.at || t >= end) continue;
        const actual = resolveOptions(mod.meta, cueOptions(cue, options)), strength = Number(actual.cameraMotion ?? 1);
        if (!Number.isFinite(strength) || strength < 0) throw new RangeError('Cue cameraMotion must be finite and non-negative');
        const offset = mod.cameraShake(childTime(t, source), actual), fade = envelope(t, cue, end) * strength;
        x += offset[0] * fade; y += offset[1] * fade;
      }
      return [x, y] as const;
    },
    create(options: EffectOptions) {
      const cues: ChainCue[] = loaded.filter(c => visible(c.cue, options)).map(({ cue, mod, end }) => ({
        ...cueOptions(cue, options), fx: mod, t: cue.at, until: Math.max(cue.at, end), fadeIn: cue.fadeIn, fadeOut: cue.fadeOut,
      }));
      const factory = chain(cues);
      let scheduler = factory(options), cycle = 0;
      return {
        advanceTime(time: number) {
          const { time: local, cycle: nextCycle } = clock(time);
          if (nextCycle !== cycle) { scheduler = factory(options); cycle = nextCycle; }
          scheduler.advanceTime(local);
        },
        drawBack: (p: Parameters<typeof scheduler.drawBack>[0]) => scheduler.drawBack(p),
        draw: (p: Parameters<typeof scheduler.draw>[0]) => scheduler.draw(p),
      };
    },
  };
}
