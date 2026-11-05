/** Serializable scene settings shared by preview, export and native asset manifests. */
import type { Camera3D } from '../3d/painter.js';
import type { PointLight3D, LightingOptions3D } from '../3d/lighting.js';
import type { CinematicOptions } from './cinematic.js';

export const EFFECT_IDS_3D = ['frost', 'slash', 'blackhole', 'wind', 'windOriginal', 'shatter', 'flame', 'lightning', 'water', 'voidrift', 'meteor', 'laser', 'shield'] as const;
export type EffectId3D = typeof EFFECT_IDS_3D[number];
export type CinematicProfile3D = Omit<CinematicOptions, 'background' | 'radiance' | 'legacyLight' | 'occlusion'>;
export interface RenderProfile3D {
  version: 1;
  effectId: EffectId3D;
  camera: Camera3D;
  lights: PointLight3D[];
  lighting: LightingOptions3D;
  cinematic: CinematicProfile3D;
  background: string | number | null;
  grid: boolean;
  cameraMotion: boolean;
  nativeSize: [number, number];
}
export type RenderProfileOverrides3D = Partial<Omit<RenderProfile3D, 'version' | 'effectId' | 'camera' | 'cinematic'>> & {
  camera?: Partial<Camera3D>; cinematic?: CinematicProfile3D;
};
const windLights: PointLight3D[] = [
  { position: [-2.1, 3.5, 1.7], radius: 7, color: '#70efff', intensity: 1.65, specular: .5, rim: .25 },
  { position: [2.4, 2.1, -1.8], radius: 6, color: '#8b9dff', intensity: 1.15, specular: .38, rim: .22 },
];
const rigs: Partial<Record<EffectId3D, PointLight3D[]>> = {
  blackhole: [
    { position: [-2.3, 3.3, 1.5], radius: 6.5, color: '#ff874b', intensity: 1.8, specular: .5, rim: .25 },
    { position: [2.5, 1.9, -2.2], radius: 5.5, color: '#7b56ff', intensity: 1.35, specular: .42, rim: .32 },
  ],
  frost: [
    { position: [-2.2, 2.8, 2], radius: 7.1, color: '#6fe5ff', intensity: 1.9, specular: .55, rim: .32 },
    { position: [2.2, 1.3, -1.8], radius: 6.5, color: '#9d79ff', intensity: 1.05, specular: .36 },
  ],
  slash: [
    { position: [-1.2, 3.2, 1.8], radius: 7, color: '#96ccff', intensity: 1.6, specular: .6 },
    { position: [2.6, 2, -1.8], radius: 6.4, color: '#eb82ff', intensity: 1.4, specular: .42, rim: .3 },
  ],
  shatter: [
    { position: [-2.2, 4, 2], radius: 7, color: '#91e8fa', intensity: 1.2, specular: .6 },
    { position: [2, 2, -2], radius: 6, color: '#486dc4', intensity: .6, specular: .3 },
  ],
  windOriginal: windLights,
};
const layout: Record<EffectId3D, [number, number]> = {
  frost: [1, .75], slash: [1, 1.4], blackhole: [1.36, 1.12], wind: [1.18, 2.35], windOriginal: [1.18, 2.35],
  shatter: [1.2, 1.1], flame: [1.65, 1.95], lightning: [1.35, 2.6], water: [1.28, 1.05], voidrift: [1.3, 2.5],
  meteor: [.98, 2.3], laser: [1.45, 1.2], shield: [1.45, 2.1],
};
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

/** Native sizes are authoring targets; callers may override without changing the scene recipe. */
export function createRenderProfile3D(effectId: string, overrides: RenderProfileOverrides3D = {}): RenderProfile3D {
  if (!(EFFECT_IDS_3D as readonly string[]).includes(effectId)) throw new RangeError(`Unknown 3D profile: ${effectId}`);
  const id = effectId as EffectId3D, [zoom, targetY] = layout[id], wind = id === 'wind' || id === 'windOriginal';
  const base: RenderProfile3D = {
    version: 1, effectId: id,
    camera: { yaw: .68, elevation: 28 * Math.PI / 180, zoom, target: [0, targetY, 0], projection: 'orthographic' },
    lights: copy(rigs[id] ?? []), lighting: { ambientOcclusion: { radius: 3, bias: .1, intensity: .34 } },
    cinematic: { bloom: { threshold: .12, knee: .2, intensity: 1.1, levels: 4 }, toneMap: 'aces', exposure: 1.3,
      saturation: 1.12, contrast: 1.05, vignette: .07, chromaticFringe: .55 },
    background: id === 'blackhole' ? '#05030d' : wind ? '#061222' : '#0a1525',
    grid: id !== 'blackhole' && !wind, cameraMotion: true,
    nativeSize: id === 'flame' ? [192, 144] : id === 'meteor' ? [260, 180] : [320, 220],
  };
  const profile = { ...base, ...copy(overrides), version: 1 as const, effectId: id,
    camera: { ...base.camera, ...copy(overrides.camera ?? {}) },
    cinematic: { ...base.cinematic, ...copy(overrides.cinematic ?? {}) },
  };
  validateRenderProfile3D(profile);
  return profile;
}

export function validateRenderProfile3D(value: unknown): asserts value is RenderProfile3D {
  if (!value || typeof value !== 'object') throw new TypeError('Render profile must be an object');
  const p = value as RenderProfile3D;
  if (p.version !== 1 || !(EFFECT_IDS_3D as readonly string[]).includes(p.effectId)) throw new RangeError('Unsupported render profile version/effect');
  if (!Array.isArray(p.nativeSize) || p.nativeSize.length !== 2 || !p.nativeSize.every(n => Number.isSafeInteger(n) && n > 0 && n <= 16384)) throw new RangeError('Profile nativeSize must contain two positive dimensions up to 16384');
  if (!p.camera || ![p.camera.yaw, p.camera.elevation, p.camera.zoom].every(Number.isFinite) || p.camera.zoom <= 0) throw new RangeError('Invalid profile camera');
  if (p.camera.target && (p.camera.target.length !== 3 || !p.camera.target.every(Number.isFinite))) throw new RangeError('Invalid camera target');
  if (p.camera.projection && !['perspective', 'orthographic'].includes(p.camera.projection)) throw new RangeError('Invalid projection');
  if (p.camera.perspective !== undefined && !Number.isFinite(p.camera.perspective)) throw new RangeError('Invalid camera perspective');
  if (!Array.isArray(p.lights) || p.lights.some(l => !l || !Array.isArray(l.position) || l.position.length !== 3 || !l.position.every(Number.isFinite)
    || !Number.isFinite(l.radius) || l.radius <= 0 || !Number.isFinite(l.intensity) || l.intensity < 0)) throw new RangeError('Invalid profile light');
  if (!p.cinematic || !p.lighting || typeof p.grid !== 'boolean' || typeof p.cameraMotion !== 'boolean') throw new TypeError('Incomplete render profile');
  for (const [name, n] of Object.entries(p.cinematic)) if (typeof n === 'number' && (!Number.isFinite(n) || n < 0)) throw new RangeError(`Invalid cinematic ${name}`);
  if (p.cinematic.toneMap && !['aces', 'reinhard', 'none'].includes(p.cinematic.toneMap)) throw new RangeError('Invalid tone mapper');
  if (p.cinematic.bloom && Object.values(p.cinematic.bloom).some(n => typeof n !== 'number' || !Number.isFinite(n) || n < 0)) throw new RangeError('Invalid bloom settings');
  if (p.background !== null && !(typeof p.background === 'number' && Number.isInteger(p.background))
    && !(typeof p.background === 'string' && /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(p.background))) throw new RangeError('Invalid background');
}
export function parseRenderProfile3D(json: string): RenderProfile3D { const p: unknown = JSON.parse(json); validateRenderProfile3D(p); return copy(p); }
export function serializeRenderProfile3D(profile: RenderProfile3D): string { validateRenderProfile3D(profile); return JSON.stringify(profile, null, 2); }
export function cloneRenderProfile3D(profile: RenderProfile3D): RenderProfile3D { validateRenderProfile3D(profile); return copy(profile); }
