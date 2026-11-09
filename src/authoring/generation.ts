/** Structured meaning -> a causal first-generation composition.
 * A bounded procedural vocabulary, not unrestricted natural-language interpretation. */
import { PAL, fit } from '../core/color.js';
import { rng, smooth, TAU } from '../core/math.js';
import { createSparkField2D } from '../core/spark-field.js';
import { createCinematicParticles2D } from '../core/cinematic-particles.js';
import { createThermalRibbon2D } from '../core/thermal-ribbon.js';
import { createKineticBody2D } from '../core/kinetic-body.js';
import { createIgnitionPose2D } from '../core/ignition-pose.js';
import { createDissipationPose2D } from '../core/dissipation-pose.js';
import { motionTrail, drawTrail } from '../core/quality.js';
import { createChargeVolume2D } from '../core/charge-volume.js';
import { createParticleVolume2D } from '../core/particle-volume.js';
import { createCurlFlow2D } from '../core/curl-flow.js';
import { createLightningStrikeGeneration2D } from './lightning-generation.js';
import { createWaterPourGeneration2D, WATER_POUR, WATER_POUR_FLIGHT, WATER_POUR_LANDING } from './water-generation.js';
import { createIceShatterGeneration2D } from './ice-generation.js';
import type { Painter, Point } from '../core/painter.js';

export type GenerationMaterial2D = 'fire' | 'energy' | 'ice' | 'water' | 'lightning';
export type GenerationAction2D = 'dash' | 'burst' | 'plume' | 'shatter' | 'pour' | 'strike';
export type GenerationResponse2D = 'burst' | 'dissipate';
export interface GenerationIntent2D {
  material: GenerationMaterial2D;
  action: GenerationAction2D;
  /** Omission means dissipate: never invent an unrequested explosion. */
  response?: GenerationResponse2D;
  seed?: number;
  /** For dash only. Local travel distance and duration; other actions reject these controls. */
  distance?: number;
  travel?: number;
}
export interface GenerationPlan2D {
  readonly schema: 'poku.generation-plan/v1';
  readonly intent: Readonly<Required<Pick<GenerationIntent2D, 'material' | 'action' | 'response' | 'seed'>>
    & Pick<GenerationIntent2D, 'distance' | 'travel'>>;
  readonly timing: Readonly<{ release: number; arrival: number; sourceEmissionEnd: number; emissionEnd: number; end: number }>;
  readonly from: readonly [number, number];
  readonly to: readonly [number, number];
  readonly size: readonly [number, number];
  readonly origin: readonly [number, number];
  readonly events: readonly Readonly<{ id: string; at: number; kind: string;
    payload: Readonly<{ x: number; y: number; material: GenerationMaterial2D }> }>[];
}

const materialAliases: Record<string, GenerationMaterial2D> = { fire: 'fire', 화염: 'fire', 불꽃: 'fire', energy: 'energy', 에너지: 'energy', ice: 'ice', 얼음: 'ice', water: 'water', 물: 'water', lightning: 'lightning', 번개: 'lightning' };
const actionAliases: Record<string, GenerationAction2D> = { dash: 'dash', 돌진: 'dash', burst: 'burst', 폭발: 'burst', plume: 'plume', 분출: 'plume', shatter: 'shatter', 파쇄: 'shatter', pour: 'pour', 붓기: 'pour', strike: 'strike', 낙뢰: 'strike' };
const responseAliases: Record<string, GenerationResponse2D> = { burst: 'burst', 폭발: 'burst', dissipate: 'dissipate', 소멸: 'dissipate', 잔열: 'dissipate' };
/** Exact aliases only. Negation and free prose are never silently reduced to keyword matches. */
export function parseGenerationMeaning2D(material: string, action: string, response?: string): GenerationIntent2D {
  const parse = <T>(table: Record<string, T>, value: string, label: string): T => {
    if (typeof value !== 'string') throw new TypeError(`${label} must be a supported word`);
    const key = value.trim().toLowerCase();
    if (!Object.hasOwn(table, key)) throw new RangeError(`Unsupported ${label}: ${value}. Use an explicit supported value, not free prose.`);
    return table[key];
  };
  return { material: parse(materialAliases, material, 'material'), action: parse(actionAliases, action, 'action'),
    ...(response === undefined ? {} : { response: parse(responseAliases, response, 'response') }) };
}

/** One source of timing/position truth drives shapes, emission windows, terminal responses and events. */
export function createGenerationPlan2D(input: GenerationIntent2D): GenerationPlan2D {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Generation intent must be an object');
  if (Object.keys(input).some(key => !['material', 'action', 'response', 'seed', 'distance', 'travel'].includes(key)))
    throw new RangeError('Unknown generation intent field');
  const { material, action, response = 'dissipate', seed = 1 } = input;
  if (!['fire', 'energy', 'ice', 'water', 'lightning'].includes(material) || !['dash', 'burst', 'plume', 'shatter', 'pour', 'strike'].includes(action)
    || !['burst', 'dissipate'].includes(response)) throw new RangeError('Unsupported generation material, action or response');
  if ((material === 'lightning') !== (action === 'strike'))
    throw new RangeError('Lightning supports strike only; other materials do not support strike');
  if ((material === 'water') !== (action === 'pour'))
    throw new RangeError('Water supports pour only; other materials do not support pour');
  if ((material === 'ice') !== (action === 'shatter'))
    throw new RangeError('Ice supports shatter only; fire/energy support dash, burst or plume');
  if (action !== 'dash' && (response !== 'dissipate' || input.distance !== undefined || input.travel !== undefined))
    throw new RangeError('Only dash supports a terminal burst, distance or travel controls');
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) throw new RangeError('Generation seed must be uint32');
  const distance = input.distance === undefined ? 128 : input.distance, travel = input.travel === undefined ? 0.74 : input.travel;
  if (!Number.isFinite(distance) || distance < 24 || distance > 160 || !Number.isFinite(travel) || travel < 0.25 || travel > 3)
    throw new RangeError('Dash distance must be 24..160px and travel 0.25..3s');
  if (material === 'lightning') {
    const release = .06, arrival = .23, repeat = .41, sourceEmissionEnd = .48, emissionEnd = sourceEmissionEnd, end = .95;
    const from = Object.freeze([-12, -150]) as readonly [number, number], to = Object.freeze([0, 0]) as readonly [number, number];
    const events = [
      { id: 'release', at: release, kind: 'release', payload: { x: from[0], y: from[1], material } },
      { id: 'arrival', at: arrival, kind: 'arrival', payload: { x: to[0], y: to[1], material } },
      { id: 'strike', at: arrival, kind: 'strike', payload: { x: to[0], y: to[1], material } },
      { id: 'restrike', at: repeat, kind: 'restrike', payload: { x: to[0], y: to[1], material } },
      { id: 'source-emission-end', at: sourceEmissionEnd, kind: 'source-emission-end', payload: { x: from[0], y: from[1], material } },
      { id: 'emission-end', at: emissionEnd, kind: 'emission-end', payload: { x: to[0], y: to[1], material } },
    ];
    return Object.freeze({ schema: 'poku.generation-plan/v1', intent: Object.freeze({ material, action, response, seed }),
      timing: Object.freeze({ release, arrival, sourceEmissionEnd, emissionEnd, end }), from, to,
      size: Object.freeze([280, 232]) as readonly [number, number], origin: Object.freeze([140, 196]) as readonly [number, number],
      events: Object.freeze(events.map(e => Object.freeze({ ...e, payload: Object.freeze(e.payload) }))) });
  }
  if (material === 'water') {
    const release = .18, sourceEmissionEnd = 1.35, arrival = release + WATER_POUR_FLIGHT;
    const emissionEnd = sourceEmissionEnd + WATER_POUR_FLIGHT, end = 3.1;
    const from = Object.freeze([WATER_POUR.launch.x, -WATER_POUR.launch.h]) as readonly [number, number];
    const to = Object.freeze([WATER_POUR_LANDING.x, 0]) as readonly [number, number];
    const events = [
      { id: 'release', at: release, kind: 'release', payload: { x: from[0], y: from[1], material } },
      { id: 'arrival', at: arrival, kind: 'arrival', payload: { x: to[0], y: to[1], material } },
      { id: 'source-emission-end', at: sourceEmissionEnd, kind: 'source-emission-end', payload: { x: from[0], y: from[1], material } },
      { id: 'emission-end', at: emissionEnd, kind: 'emission-end', payload: { x: to[0], y: to[1], material } },
    ];
    return Object.freeze({ schema: 'poku.generation-plan/v1', intent: Object.freeze({ material, action, response, seed }),
      timing: Object.freeze({ release, arrival, sourceEmissionEnd, emissionEnd, end }), from, to,
      size: Object.freeze([240, 200]) as readonly [number, number], origin: Object.freeze([110, 160]) as readonly [number, number],
      events: Object.freeze(events.map(e => Object.freeze({ ...e, payload: Object.freeze(e.payload) }))) });
  }
  const release = action === 'shatter' ? 0.36 : action === 'burst' ? 0.22 : 0.28;
  const arrival = action === 'dash' ? release + travel : release;
  const sourceEmissionEnd = action === 'plume' ? release + 1.3 : arrival;
  const emissionEnd = action === 'burst' || response === 'burst' ? arrival + 0.08 : sourceEmissionEnd;
  const end = sourceEmissionEnd + (action === 'shatter' ? 1.15 : action === 'plume' ? 1.35 : action === 'burst' || response === 'burst' ? 1.25 : 1.05);
  const from = Object.freeze(action === 'dash' ? [-distance / 2, -16] : [0, action === 'plume' ? 12 : -16]) as readonly [number, number];
  const to = Object.freeze(action === 'dash' ? [distance / 2, -16] : [...from]) as readonly [number, number];
  const events = [{ id: 'release', at: release, kind: 'release', payload: { x: from[0], y: from[1], material } }];
  if (action === 'dash') events.push({ id: 'arrival', at: arrival, kind: 'arrival', payload: { x: to[0], y: to[1], material } });
  if (action === 'burst' || response === 'burst') events.push({ id: 'burst', at: arrival, kind: 'burst', payload: { x: to[0], y: to[1], material } });
  if (action === 'shatter') events.push({ id: 'shatter', at: release, kind: 'shatter', payload: { x: from[0], y: from[1], material } });
  if (action !== 'burst') events.push({ id: 'source-emission-end', at: sourceEmissionEnd, kind: 'source-emission-end', payload: { x: to[0], y: to[1], material } });
  events.push({ id: 'emission-end', at: emissionEnd, kind: 'emission-end', payload: { x: to[0], y: to[1], material } });
  return Object.freeze({ schema: 'poku.generation-plan/v1',
    intent: Object.freeze({ material, action, response, seed, ...(action === 'dash' ? { distance, travel } : {}) }),
    timing: Object.freeze({ release, arrival, sourceEmissionEnd, emissionEnd, end }), from, to,
    size: Object.freeze([384, 256]) as readonly [number, number], origin: Object.freeze([192, 170]) as readonly [number, number],
    events: Object.freeze(events.map(event => Object.freeze({ ...event, payload: Object.freeze(event.payload) }))) });
}

/** JSON round-trip validation: derived clocks/anchors cannot silently disagree with the intent. */
export function resolveGenerationPlan2D(input: unknown): GenerationPlan2D {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TypeError('Generation plan must be an object');
  const p = input as GenerationPlan2D;
  if (p.schema !== 'poku.generation-plan/v1') throw new RangeError('Unsupported generation plan schema');
  if (Object.keys(p).some(key => !['schema', 'intent', 'timing', 'from', 'to', 'size', 'origin', 'events'].includes(key)))
    throw new RangeError('Unknown generation plan field');
  const resolved = createGenerationPlan2D(p.intent);
  // Compare named fields, independently of JSON key order. Never execute serialized callbacks.
  for (const key of ['timing', 'from', 'to', 'size', 'origin', 'events'] as const) {
    const same = (a: unknown, b: unknown): boolean => {
      if (a === b) return true;
      if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
      const keys = Object.keys(a);
      return keys.length === Object.keys(b).length && keys.every(k => Object.hasOwn(b, k)
        && same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
    };
    if (!same(p[key], resolved[key])) throw new RangeError(`Generation ${key} disagrees with its intent; regenerate the plan after edits`);
  }
  return resolved;
}

/** Geometric tangent stays defined when the timing curve comes to rest. */
function dashPathTangent(plan: GenerationPlan2D, phase: number): Point {
  return [plan.to[0] - plan.from[0], -12 * Math.PI * Math.cos(phase * Math.PI)];
}

/** The same analytic source is used for the primary form and detached particle birth velocity. */
export function generationSource2D(plan: GenerationPlan2D, time: number): { position: Point; velocity: Point } {
  if (!Number.isFinite(time)) throw new RangeError('Generation time must be finite');
  if (plan.intent.action !== 'dash' || time <= plan.timing.release)
    return { position: [...plan.from], velocity: [0, 0] };
  if (time >= plan.timing.arrival) return { position: [...plan.to], velocity: [0, 0] };
  const travel = plan.timing.arrival - plan.timing.release, u = (time - plan.timing.release) / travel;
  const v = u * u * (3 - 2 * u), dv = 6 * u * (1 - u) / travel, distance = plan.to[0] - plan.from[0];
  const tangent = dashPathTangent(plan, v);
  return { position: [plan.from[0] + distance * v, plan.from[1] - 12 * Math.sin(v * Math.PI)],
    velocity: [tangent[0] * dv, tangent[1] * dv] };
}

/** A real generated module with deterministic direct-time drawing and independently switchable layers.
 * The vocabulary is intentionally small: it doesn't promise a requested creature, fluid, or engine style. */
export interface GenerationCompositionOptions2D {
  /** Explicit new-artwork selection. Volumes changes shed matter; material-volumes
   * also gives energy a packet primary. Omission preserves saved compositions. */
  composition?: 'body' | 'volumes' | 'material-volumes';
  /** Explicit new ice artwork only. Omission retains existing opaque facets. */
  iceSurface?: 'facets' | 'crystal';
  /** Explicit fire plume, dash (either response) or burst accent replacement. Other artwork stays exact. */
  fireSparks?: 'short-exposure';
  /** Explicit opt-in short-spark glints; no body, motion or birth-count change. */
  fireSparkFinish?: 'scintillation';
  /** 0..720 births; requires short-exposure. Omission keeps plume 360 / dash-dissipate 240 / burst 170 / dash-burst 410. */
  fireSparkCount?: number;
  /** 0..2 spark-only glow multiplier; requires short-exposure. Omission keeps 1. */
  fireSparkLight?: number;
}
export function createGeneratedEffect2D(input: GenerationPlan2D, options: GenerationCompositionOptions2D = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)
    || Object.keys(options).some(k => !['composition', 'iceSurface', 'fireSparks', 'fireSparkCount', 'fireSparkLight', 'fireSparkFinish'].includes(k))
    || (options.composition !== undefined && !['body','volumes','material-volumes'].includes(options.composition))
    || (options.iceSurface !== undefined && !['facets', 'crystal'].includes(options.iceSurface)))
    throw new RangeError('Invalid generation composition options');
  if (options.fireSparks !== undefined && options.fireSparks !== 'short-exposure') throw new RangeError('Invalid fire sparks');
  if (options.fireSparkFinish !== undefined && options.fireSparkFinish !== 'scintillation') throw new RangeError('Invalid fire spark finish');
  if (options.fireSparkFinish !== undefined && options.fireSparks !== 'short-exposure') throw new RangeError('Spark finish requires short-exposure sparks');
  const { fireSparkCount, fireSparkLight, fireSparkFinish } = options;
  if (fireSparkCount !== undefined && (!Number.isInteger(fireSparkCount) || fireSparkCount < 0 || fireSparkCount > 720))
    throw new RangeError('Fire spark count must be an integer from 0 to 720');
  if (fireSparkLight !== undefined && (!Number.isFinite(fireSparkLight) || fireSparkLight < 0 || fireSparkLight > 2))
    throw new RangeError('Fire spark light must be finite from 0 to 2');
  if ((fireSparkCount !== undefined || fireSparkLight !== undefined) && options.fireSparks !== 'short-exposure')
    throw new RangeError('Fire spark count and light require short-exposure sparks');
  const plan = resolveGenerationPlan2D(input), { material, action, response } = plan.intent,
    { release, arrival, sourceEmissionEnd, emissionEnd, end } = plan.timing;
  if (options.fireSparks !== undefined && (material !== 'fire' || !['plume', 'dash', 'burst'].includes(action) || (response !== 'dissipate' && action !== 'dash')))
    throw new RangeError('Short-exposure sparks require fire plume, burst or dash');
  const useSparkField = options.fireSparks === 'short-exposure';
  const combinedSparks = action === 'dash' && response === 'burst';
  // Explicit count is a total birth budget, apportioned by the established 240:170 schedules.
  const flightSparkCount = combinedSparks ? Math.round((fireSparkCount ?? 410) * 240 / 410)
    : fireSparkCount ?? (action === 'plume' ? 360 : 240);
  const responseSparkCount = combinedSparks ? (fireSparkCount ?? 410) - flightSparkCount : fireSparkCount ?? 170;
  // Both phases overlap after arrival. Partition, rather than duplicate, the 24-light ceiling.
  const totalSparkLights = Math.min(24, combinedSparks ? flightSparkCount + responseSparkCount : 24);
  const flightSparkLights = combinedSparks ? Math.round(totalSparkLights * flightSparkCount / Math.max(1, flightSparkCount + responseSparkCount)) : 24;
  const responseSparkLights = combinedSparks ? totalSparkLights - flightSparkLights : 24;
  const volumes = options.composition === 'volumes' || options.composition === 'material-volumes';
  const charged = options.composition === 'material-volumes' && material === 'energy';
  if (volumes && (material === 'ice' || material === 'water' || material === 'lightning' || !['dash','plume'].includes(action) || response !== 'dissipate'))
    throw new RangeError('Volume composition supports fire/energy dash or plume with dissipation');
  // Rigid ice has its own geometry and lifecycle. Never feed it through the flame/energy renderer.
  if (material === 'ice') return createIceShatterGeneration2D(plan, options.iceSurface === 'crystal');
  if (options.iceSurface !== undefined) throw new RangeError('Ice surface options require ice material');
  if (material === 'water') return createWaterPourGeneration2D(plan);
  if (material === 'lightning') return createLightningStrikeGeneration2D(plan);
  const isFire = material === 'fire', isBurst = action === 'burst' || response === 'burst';
  const description = `${material} ${action}${action === 'dash' ? ` then ${response}` : ''}; source-linked motion and response.`;
  const meta = { name: description, desc: description, tags: [material, action, response, 'generated-sequence'],
    size: [...plan.size], origin: [...plan.origin], duration: end, fps: 40, loop: false, bg: 'dark',
    options: { seed: plan.intent.seed, palette: [...(isFire ? PAL.fire : PAL.arcane)] } };
  type Options = { seed: number; palette: (string | number)[]; layers?: Record<string, boolean> };
  return { meta, events: plan.events,
    create(options: Options) {
      if (!Number.isSafeInteger(options.seed) || options.seed < 0 || options.seed > 0xffffffff)
        throw new RangeError('Generated effect seed must be uint32');
      if (!Array.isArray(options.palette) || !options.palette.length || options.palette.some(c => typeof c === 'number'
        ? !Number.isInteger(c) || c < -0x80000000 || c > 0xffffffff : !/^#(?:[\da-f]{3}|[\da-f]{6})$/i.test(c)))
        throw new RangeError('Generated effect palette must contain packed colors or #rgb/#rrggbb');
      if (options.layers !== undefined && (!options.layers || typeof options.layers !== 'object' || Array.isArray(options.layers)
        || Object.entries(options.layers).some(([key, value]) => !['body', 'trail', 'sparks', 'response', 'residue', 'light'].includes(key)
          || typeof value !== 'boolean'))) throw new RangeError('Invalid generated layer flags');
      const layers = { ...options.layers };
      const C = fit(options.palette, 8), hot = [C[6], C[5], C[4], C[3], C[2]], seed = options.seed;
      const lightEnabled = layers.light !== false;
      const chargeBody = charged ? createChargeVolume2D({ seed, palette: hot }) : undefined;
      const streamBody = createKineticBody2D({ seed, material, profile: 'stream', palette: hot });
      const plumeBody = createKineticBody2D({ seed, material, profile: 'plume', palette: hot });
      const burstBody = createKineticBody2D({ seed, material, profile: 'burst', palette: hot });
      const dashBodyState = (time: number) => {
        const { position: [x, y], velocity } = generationSource2D(plan, time);
        const tangent = time === release ? dashPathTangent(plan, 0) : velocity;
        return { time, position: [x - 6, y] as Point, size: [23, 11] as Point, angle: Math.atan2(tangent[1], tangent[0]) };
      };
      const burstBodyState = (time: number) => {
        const age = Math.max(0, time - arrival), radius = 6 + 33 * (1 - Math.exp(-age * 11));
        const burnout = isFire ? smooth(0.08, 0.5, age) : 0;
        return { time, position: [plan.to[0], plan.to[1] - (isFire ? 9 * burnout * burnout : 0)] as Point,
          size: [radius, radius] as Point, progress: Math.min(1, age / 0.5), burnout };
      };
      // Preparation uses the upcoming material/profile, anchored to its eventual source.
      // Plumes stay short before release, then grow upward without crossfading a separate oval.
      const launchTangent = dashPathTangent(plan, 0);
      const ignition = createIgnitionPose2D({ start: 0, duration: release + (action === 'plume' ? 0.12 : 0),
        position: action === 'dash' ? [plan.from[0] - 6, plan.from[1]]
          : action === 'plume' ? [plan.from[0], plan.from[1] - 22] : plan.from,
        size: action === 'dash' ? [23, 11] : action === 'plume' ? [22, 12] : [6, 6],
        angle: action === 'dash' ? Math.atan2(launchTangent[1], launchTangent[0]) : action === 'plume' ? -Math.PI / 2 : 0,
        anchor: action === 'plume' ? [-1, 0] : [0, 0], opacity: action === 'plume' ? 0.9 : 1,
        keys: action === 'plume' ? [{ at: 0, scale: [0.12, 0.4] },
          { at: release / (release + 0.12), scale: [0.32, 0.8] }, { at: 1, scale: [1, 1] }]
          : action === 'burst' ? [{ at: 0, scale: [0.25, 0.25] },
            { at: 0.62, scale: [1.45, 1.45] }, { at: 1, scale: [1, 1] }] : undefined,
      });
      // Source velocity is zero at arrival, but the left-hand path tangent is not horizontal.
      // Keep that complete pose rather than replacing the head with a small ending ellipse.
      const terminalTangent = dashPathTangent(plan, 1), terminalAngle = Math.atan2(terminalTangent[1], terminalTangent[0]);
      const terminalPosition: Point = [plan.to[0] - 6, plan.to[1]];
      const dissipation = action === 'dash' && !isBurst ? createDissipationPose2D({
        start: arrival, duration: isFire ? 0.38 : 0.30, position: terminalPosition,
        size: [23, 11], angle: terminalAngle, drift: [0, isFire ? -7 : -2], endScale: [0.55, 0.8],
      }) : undefined;
      const terminalTail = dissipation && !volumes ? motionTrail(time => generationSource2D(plan, time).position,
        arrival, 0.14, 12, release) : [];
      const source = (birth: number, _id: number, u: number): Point => {
        const { position: [x, y] } = generationSource2D(plan, birth);
        // Finite volumes are born inside the burning source, not centered across its floor.
        return action === 'plume' ? [x + (u - 0.5) * 20, y - (volumes ? 8 : 0)] : [x - 5, y + (u - 0.5) * 8];
      };
      const inheritedVelocity = (birth: number): Point => {
        const v = generationSource2D(plan, birth).velocity;
        // Shed matter keeps part of the source's momentum instead of following the actor later.
        return [v[0] * 0.32, v[1] * 0.32];
      };
      const emissionSource = action === 'dash' ? { emissionFrame: (birth: number, _id: number, u: number) => {
        const state = dashBodyState(birth), surface = streamBody.sampleSurface(state, 0.25 + u * 0.5);
        const rear: Point = [-Math.cos(state.angle), -Math.sin(state.angle)];
        return { position: [surface.position[0] - surface.normal[0] * 0.5, surface.position[1] - surface.normal[1] * 0.5] as Point,
          direction: [rear[0] * 0.75 + surface.normal[0] * 0.25, rear[1] * 0.75 + surface.normal[1] * 0.25] as Point,
          inheritedVelocity: inheritedVelocity(birth) };
      } } : { source, inheritedVelocity, angle: action === 'plume' ? -Math.PI / 2 : Math.PI };
      const emission = { count: action === 'burst' ? 0 : action === 'plume' ? 240 : 180, seed, palette: hot,
        ...emissionSource, start: release, duration: sourceEmissionEnd - release,
        spread: action === 'plume' ? 0.48 : 0.8,
        life: charged ? [.12, .30] as const : action === 'plume' ? [0.65, 1.15] as const : [0.28, 0.65] as const,
        speed: charged ? (action === 'plume' ? [70, 125] as const : [45, 90] as const) : action === 'plume' ? [30, 70] as const : [28, 62] as const, gravity: isFire ? -10 : 0, drag: 0.8 };
      // Main shed matter occupies a finite evolving volume, not the particle's entire history.
      // Existing effects omit this opt-in and retain their original paths, palette and body.
      // Charged matter is a live volume of short-lived source-born packets, not a permanent head sticker.
      const chargedCores = charged ? createCinematicParticles2D({ seed: (seed ^ 4127) >>> 0,
        count: action === 'plume' ? 180 : 140, start: 0, duration: sourceEmissionEnd,
        palette: hot, style: 'ember', size: [5.5, 9], endSize: .55, life: [.14, .26],
        speed: action === 'plume' ? [10, 30] : [0, 10], spread: .45, gravity: 0, drag: .8,
        opacity: .85, fadeStart: .65, emission: 0,
        emissionFrame: (birth, id, u) => {
          const source = generationSource2D(plan, birth), r = rng(seed, id, 623), ignition = smooth(0, release, birth);
          const tangent = action === 'plume' ? [0, -1] : dashPathTangent(plan, smooth(release, arrival, birth));
          const length = Math.hypot(...tangent), tx = tangent[0] / length, ty = tangent[1] / length;
          const along = r.range(-5, 5) * ignition, across = (u - .5) * (action === 'plume' ? 14 : 7) * ignition;
          const y = source.position[1] - (action === 'plume' ? 7 : 0);
          // A short charged core inherits direction, but a legal 160px/.25s source must not
          // launch it outside the native canvas during its .26s lifetime. Normal recipes stay exact.
          const momentum = Math.min(.95, 400 / (Math.hypot(...source.velocity) || 1));
          return { position: [source.position[0] + tx * along - ty * across, y + ty * along + tx * across],
            direction: [tx, ty], inheritedVelocity: [source.velocity[0] * momentum, source.velocity[1] * momentum] };
        },
      }) : undefined;
      const particleVolume = volumes ? createParticleVolume2D({ seed, profile: material, palette: hot,
        emission: lightEnabled ? .035 : 0, lightRadius: 3 }) : undefined;
      const ribbons = createCinematicParticles2D({ ...emission, style: volumes ? 'ember' : 'ribbon',
        size: action === 'plume' ? [3, 7] : volumes ? [3, 6.5] : [2, 4.8],
        ...(volumes ? { flow: createCurlFlow2D({ seed: (seed ^ 9103) >>> 0, scale: 22,
          strength: isFire ? 70 : 40, drift: action === 'plume' ? [0, -24] : [24, -3] }) }
          : { curl: { amplitude: isFire ? 4.5 : 1.5, frequency: 1.25 } }),
        trailSeconds: 0.18, emission: lightEnabled ? 0.035 : 0, layer: 'back' });
      const sparkField = useSparkField && action !== 'burst' ? createSparkField2D({ seed: (seed ^ 771) >>> 0, palette: C,
        count: flightSparkCount, start: release, duration: sourceEmissionEnd - release,
        life: [.32, .95], speed: action === 'plume' ? [55, 160] : [38, 130], width: [.9, 2.2],
        drag: [.45, 1.6], gravity: 26, spread: action === 'plume' ? 1.6 : 1.9, shutter: .042, maxLength: 8,
        light: lightEnabled, lightStrength: fireSparkLight, lightBudget: flightSparkLights, finish: fireSparkFinish, emissionFrame: (birth, id, u) => {
          if (action === 'dash') return emissionSource.emissionFrame!(birth, id, u);
          const [x, y] = source(birth, id, u);
          return { position: [x, y - 8], direction: [0, -1] };
        } }) : undefined;
      const sparks = sparkField ? undefined : createCinematicParticles2D({ ...emission, seed: seed ^ 771, count: emission.count,
        style: 'spark', size: [0.5, 1.2], spread: action === 'plume' ? 0.85 : 1.1, emission: lightEnabled ? 0.025 : 0, trailSeconds: 0.065 });
      // Unequal eruption sectors give an authored hierarchy instead of an even spark ring.
      // Keep a sparse full perimeter so the response still reads as an outward burst.
      const eruption = rng(seed, 8801), rotation = eruption.next();
      const sectors = [rotation, (rotation + eruption.range(0.28, 0.40)) % 1, (rotation + eruption.range(0.61, 0.76)) % 1];
      const burstSurfaceU = (u: number) => {
        const widths = isFire ? [0.16, 0.12, 0.08] : [0.11, 0.08, 0.06];
        const cuts = [0, 0.36, 0.60, 0.74];
        if (u >= cuts[3]) return (u - cuts[3]) / (1 - cuts[3]);
        const i = u < cuts[1] ? 0 : u < cuts[2] ? 1 : 2;
        return (sectors[i] + ((u - cuts[i]) / (cuts[i + 1] - cuts[i]) - 0.5) * widths[i] + 1) % 1;
      };
      const burstEmissionFrame = (birth: number, _id: number, u: number) => {
          const surface = burstBody.sampleSurface(burstBodyState(birth), burstSurfaceU(u));
          // A bounded authored fraction of front expansion, plus the emitter's own outgoing kick.
          const motion = 0.12 * 33 * 11 * Math.exp(-(birth - arrival) * 11);
          return { position: [surface.position[0] - surface.normal[0] * 0.5, surface.position[1] - surface.normal[1] * 0.5] as Point,
            direction: surface.normal, inheritedVelocity: [surface.normal[0] * motion, surface.normal[1] * motion] as Point };
        };
      const burstSparkField = useSparkField && isBurst ? createSparkField2D({
        seed: (seed ^ 2009) >>> 0, palette: C, count: responseSparkCount,
        start: arrival, duration: emissionEnd - arrival, emissionFrame: burstEmissionFrame,
        life: [.24, .85], speed: [48, 130], width: [.65, 1.5], drag: [1.6, 1.6], gravity: 20, spread: .65,
        shutter: .042, maxLength: 8, light: lightEnabled, lightStrength: fireSparkLight, lightBudget: responseSparkLights, finish: fireSparkFinish,
      }) : undefined;
      const burst = burstSparkField ? undefined : createCinematicParticles2D({ count: isBurst ? 170 : 0, seed: seed ^ 2009, palette: hot,
        emissionFrame: burstEmissionFrame, spread: isFire ? 0.65 : 0.32,
        start: arrival, duration: isBurst ? emissionEnd - arrival : 0, life: [0.24, 0.85], speed: [48, 130],
        drag: 1.6, gravity: isFire ? 20 : 0, style: 'spark', size: [0.65, 1.5],
        curl: { amplitude: isFire ? 2 : 0, frequency: 1 }, trailSeconds: 0.065, emission: lightEnabled ? 0.065 : 0 });
      const thermal = isFire && action === 'plume' ? createThermalRibbon2D({
        seed: seed ^ 414, count: Math.ceil(18 * (sourceEmissionEnd - release)), start: release, duration: sourceEmissionEnd - release,
        palette: hot, life: [0.45, 0.85], width: [2.4, 5.2], length: [0.65, 1.2], curl: 3, split: 0.75,
        emission: lightEnabled ? 0.035 : 0, attachment: 0, velocity: [0, -12], buoyancy: [0, -32],
        source: (time, id, u) => {
          const x = (u - 0.5) * 20, y = plan.from[1], r = rng(seed, id, 819), h = r.range(32, 58);
          const bend = Math.sin(time * 6 + r.range(0, TAU)) * 4;
          return [[x, y], [x + bend * 0.4, y - h * 0.3], [x - bend * 0.7, y - h * 0.65], [x + bend, y - h]];
        },
      }) : undefined;
      const visible = (layer: string) => layers[layer] !== false;
      const active = (t: number) => {
        if (!Number.isFinite(t)) throw new RangeError('Generation draw time must be finite');
        return t > 0 && t < end;
      };
      return {
        drawBack(p: Painter, t: number) {
          if (!active(t)) return;
          if (visible('sparks') && sparkField) sparkField.draw(p, t, 'back');
          if (visible('response') && visible('sparks') && burstSparkField) burstSparkField.draw(p, t, 'back');
          if (visible('trail')) {
            if (particleVolume) for (const sample of ribbons.sample(t)) {
              if (chargeBody) chargeBody.draw(p, { id: sample.id + 1, time: sample.age, position: [sample.x, sample.y],
                size: [sample.size * 2.2, sample.size * 1.6], angle: Math.atan2(sample.vy, sample.vx),
                opacity: sample.alpha, progress: sample.progress });
              else particleVolume.draw(p, sample);
            }
            else ribbons.draw(p, t, 'back');
          }
          // Fire carries a quiet cooling residue. Energy dissipates without borrowing smoke.
          if (isBurst && isFire && visible('residue') && t > arrival + 0.1) {
            const age = t - arrival, a = smooth(0.1, 0.3, age) * (1 - smooth(0.55, 1.18, age));
            for (let i = 0; i < 7; i++) {
              const r = rng(seed, i, 419), angle = r.range(-Math.PI, 0), radius = 9 + age * 15;
              p.disc(plan.to[0] + Math.cos(angle) * radius, plan.to[1] + Math.sin(angle) * radius - age * 7,
                6 + age * 10, C[i % 2], a * 0.25);
            }
          }
        },
        draw(p: Painter, t: number) {
          if (!active(t)) return;
          const [x, y] = generationSource2D(plan, t).position;
          if (!charged && visible('body') && t < release && action !== 'plume') {
            const pose = ignition.sample(t)!;
            (action === 'dash' ? streamBody : burstBody).draw(p, pose);
          }
          if (!charged && action === 'dash' && t >= release && t < arrival && visible('body')) {
            if (!volumes) {
              const tail = motionTrail(time => generationSource2D(plan, time).position, t, 0.14, 12, release);
              drawTrail(p, tail, { color: C[2], head: C[4], width: 9, alpha: 0.85, light: 0 });
            }
            streamBody.draw(p, dashBodyState(t));
          }
          if (!charged && action === 'plume' && visible('body')) {
            const pose = ignition.sample(t)!;
            const fade = 1 - smooth(sourceEmissionEnd - 0.18, sourceEmissionEnd + 0.22, t);
            plumeBody.draw(p, { ...pose, opacity: pose.opacity * fade });
            if (thermal) thermal.draw(p, t);
          }
          if (visible('response')) {
            if (isBurst && t >= arrival) {
              const age = t - arrival, [bx, by] = plan.to, fade = 1 - smooth(0.12, 0.5, age);
              // Arrival is shared exactly with source termination; no frame-quantized delayed blast.
              if (age < 0.5) {
                burstBody.draw(p, { ...burstBodyState(t), opacity: fade });
                p.circle(bx, by, 7 * (1 - smooth(0, 0.15, age)), C[6], fade);
              }
              if (visible('sparks')) { if (burstSparkField) burstSparkField.draw(p, t); else burst!.draw(p, t); }
            } else if (dissipation && !charged) {
              const pose = dissipation.sample(t);
              if (pose) {
                const dx = pose.position[0] - terminalPosition[0], dy = pose.position[1] - terminalPosition[1];
                if (!volumes) drawTrail(p, terminalTail.map(([x, y]): Point => [x + dx, y + dy]),
                  { color: C[2], head: C[4], width: 9, alpha: 0.85 * pose.opacity, light: 0 });
                streamBody.draw(p, pose);
              }
            }
          }
          if (chargeBody && chargedCores && visible(t < sourceEmissionEnd ? 'body' : 'response')) {
            const chargePainter = action === 'plume' ? { shade: (x0: number, y0: number, x1: number, y1: number,
              shader: Parameters<Painter['shade']>[4]) => p.shade(x0, y0, x1, y1, (x, y, out) => {
                if (y <= plan.from[1]) return shader(x, y, out);
              }) } : p;
            for (const q of chargedCores.sample(t)) chargeBody.draw(chargePainter, {
              id: q.id + 1024, time: q.age, position: [q.x, q.y], size: [q.size * 2.2, q.size * 1.6],
              angle: action === 'plume' ? -Math.PI / 2 : Math.atan2(q.vy, q.vx), opacity: q.alpha, progress: q.progress,
            });
          }
          if (visible('sparks')) {
            if (sparkField) sparkField.draw(p, t); else sparks!.draw(p, t);
          }
          if (visible('light')) {
            const charge = action === 'plume' ? smooth(0, release, t) * (1 - smooth(release, release + 0.12, t))
              : t < release ? smooth(0, release, t) : 0;
            const head = action === 'dash' && t >= release && t < arrival ? 1 : action === 'plume'
              ? smooth(release, release + 0.12, t) * (1 - smooth(sourceEmissionEnd, sourceEmissionEnd + 0.15, t)) : 0;
            if (charge + head > 0) p.glow(x, y, 22, C[4], (charge + head) * 0.22);
            const ending = dissipation?.sample(t);
            if (ending && !charged) p.glow(ending.position[0] + 6, ending.position[1], 22, C[4], ending.opacity ** 2 * 0.22);
            if (isBurst && t >= arrival) p.glow(plan.to[0], plan.to[1], 42, C[4], (1 - smooth(0, 0.42, t - arrival)) * 0.55);
          }
        },
      };
    },
  };
}
