/** Contact facts shared by choreography, material response and host feedback.
 * These facts never choose an explosion or modify a scene on their own. */
export interface ImpactContact2D {
  readonly id: string; readonly at: number; readonly position: readonly [number, number];
  /** Unit normal pointing out of the struck surface. Screen-space floor is [0,-1]. */
  readonly normal: readonly [number, number]; readonly material: string;
  readonly strength: number; readonly radius: number;
}
export type ImpactContactInput2D = Omit<ImpactContact2D, 'strength' | 'radius'> & { strength?: number; radius?: number };
export interface ContactPlacement2D { x?: number; y?: number; flip?: boolean; angle?: number }

/** Copy, normalize and freeze an authored contact in effect-local pixel coordinates. */
export function defineImpactContact2D(input: ImpactContactInput2D): ImpactContact2D {
  const { id, at, position, normal, material, strength = 1, radius = 1 } = input;
  if (typeof id !== 'string' || !id.trim() || typeof material !== 'string' || !material.trim()
    || !Array.isArray(position) || position.length !== 2 || !Array.isArray(normal) || normal.length !== 2
    || ![at, ...position, ...normal, strength, radius].every(Number.isFinite)
    || at < 0 || strength < 0 || radius <= 0) throw new RangeError('Impact contact needs an id, time, finite point/normal, material and valid strength/radius');
  const length = Math.hypot(...normal);
  if (!(length > 1e-12) || !Number.isFinite(length)) throw new RangeError('Impact contact normal must be nonzero');
  return Object.freeze({ id, at, position: Object.freeze([...position]) as readonly [number, number],
    normal: Object.freeze([normal[0] / length, normal[1] / length]) as readonly [number, number], material, strength, radius });
}

/** Transform points and normals together. Translation never affects the normal. */
export function transformImpactContact2D(contact: ImpactContact2D, placement: ContactPlacement2D): ImpactContact2D {
  const { x = 0, y = 0, flip = false, angle = 0 } = placement;
  if (![x, y, angle].every(Number.isFinite)) throw new RangeError('Contact placement must be finite');
  const c=Math.cos(angle),s=Math.sin(angle),sign=flip?-1:1,[px,py]=contact.position,[nx,ny]=contact.normal;
  return defineImpactContact2D({ ...contact, position:[x+sign*px*c-py*s,y+sign*px*s+py*c], normal:[sign*nx*c-ny*s,sign*nx*s+ny*c] });
}

/** Exact authored contacts tolerate sub-nanosecond clock roundoff, not a rendered-frame delay. */
export function impactContactAge2D(contact: ImpactContact2D, time: number): number {
  if (!Number.isFinite(time)) throw new RangeError('Contact time must be finite');
  const age=time-contact.at;
  return Math.abs(age)<1e-9?0:age;
}
