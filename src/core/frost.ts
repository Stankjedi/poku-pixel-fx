import { Rng, clamp, lerp } from './math.js';
import { defineImpactContact2D, impactContactAge2D, type ImpactContact2D } from './impact-contact.js';

export type FrostPoint2D = readonly [number, number];
export interface FrostBranch2D {
  readonly root: FrostPoint2D; readonly tip: FrostPoint2D; readonly width: number;
  /** Parent index, or -1 for a root seated on the receiving surface. */
  readonly parent: number; readonly attachment: number;
  readonly startsAt: number; readonly growsFor: number; readonly releasesAt: number;
}
export interface FrostAccretionOptions2D {
  seed?: number; count?: number; halfSpan?: number; length?: number;
  /** Seconds of exposure after contact; growth stops when exposure stops. */
  exposure?: number; spreadSpeed?: number; hold?: number;
}
export interface FrostSample2D {
  readonly growth: number; readonly attached: boolean; readonly fracture: number;
  readonly polygon: readonly FrostPoint2D[]; readonly tip: FrostPoint2D;
}
export interface FrostAccretion2D {
  readonly contact: ImpactContact2D; readonly branches: readonly FrostBranch2D[]; readonly exposureEndsAt: number;
  sample(index: number, time: number): FrostSample2D;
}
const point = (x: number, y: number): FrostPoint2D => Object.freeze([x, y]) as FrostPoint2D;

/** Seeded, seekable frost seated on a line surface. Heat transfer is art-directed, not simulated.
 * Deposition travels along the surface before branches appear. Children start only after their
 * parent's tip reaches the attachment. No growth after the beam ends, no free-floating birth.
 * `polygon` remains available after release so the same shape can become a physical flake. */
export function frostAccretion2D(input: ImpactContact2D, options: FrostAccretionOptions2D = {}): FrostAccretion2D {
  const contact = defineImpactContact2D(input);
  const { seed = 1, count = 11, halfSpan = 36, length = 19, exposure = .85, spreadSpeed = 85, hold = .24 } = options;
  if (![seed, count, halfSpan, length, exposure, spreadSpeed, hold].every(v => Number.isFinite(v) && Math.abs(v) <= 1e5)
    || !Number.isInteger(count) || count < 3 || count > 32 || halfSpan <= 0 || length <= 0
    || exposure <= 0 || exposure > 12 || spreadSpeed <= 0 || hold < 0 || hold > 12)
    throw new RangeError('Frost needs finite bounds, 3..32 roots, positive dimensions/exposure/speed and nonnegative hold');
  const rng = new Rng(seed), [nx, ny] = contact.normal, tx = -ny, ty = nx, [cx, cy] = contact.position;
  const ends = contact.at + exposure, branches: FrostBranch2D[] = [];
  const add = (root: FrostPoint2D, tip: FrostPoint2D, width: number, parent: number, attachment: number,
    startsAt: number, growsFor: number, releasesAt: number) => branches.push(Object.freeze({ root, tip, width, parent, attachment, startsAt, growsFor, releasesAt }));
  for (let i = 0; i < count; i++) {
    const along = halfSpan * (-1 + 2 * (i + .5 + (i === (count - 1) / 2 ? 0 : rng.range(-.2, .2))) / count), root = point(cx + tx * along, cy + ty * along);
    const reach = length * rng.range(.67, 1.12) * (1 - .18 * Math.abs(along) / halfSpan);
    const lean = along * .16 + rng.range(-2.5, 2.5), tip = point(root[0] + nx * reach + tx * lean, root[1] + ny * reach + ty * lean);
    const start = contact.at + Math.abs(along) / spreadSpeed, grow = rng.range(.25, .36), release = ends + hold + rng.range(0, .34) + Math.abs(along) * .001;
    const index = branches.length;
    add(root, tip, rng.range(4.1, 6.6), -1, 0, start, grow, release);
    for (const sign of [-1, 1]) {
      const at = rng.range(.44, .64), childRoot = point(lerp(root[0], tip[0], at), lerp(root[1], tip[1], at));
      const reach = length * rng.range(.25, .39), childTip = point(childRoot[0] + nx * reach * .65 + tx * reach * .76 * sign,
        childRoot[1] + ny * reach * .65 + ty * reach * .76 * sign);
      // Branches release independently first, then their supporting trunk breaks. Never float in place.
      add(childRoot, childTip, rng.range(1.6, 2.5), index, at, start + grow * at, grow * .48, release - .055);
    }
  }
  const frozen = Object.freeze(branches);
  return Object.freeze({ contact, branches: frozen, exposureEndsAt: ends, sample(index: number, time: number): FrostSample2D {
    if (!Number.isInteger(index) || index < 0 || index >= branches.length || !Number.isFinite(time)) throw new RangeError('Frost sample needs a valid branch index and finite time');
    const b = branches[index], age = impactContactAge2D(contact, time);
    const growth = age < 0 ? 0 : clamp((Math.min(time, ends) - b.startsAt) / b.growsFor);
    const tip = point(lerp(b.root[0], b.tip[0], growth), lerp(b.root[1], b.tip[1], growth));
    const dx = b.tip[0] - b.root[0], dy = b.tip[1] - b.root[1], distance = Math.hypot(dx, dy), width = b.width * Math.min(1, growth * 2), ux = -dy / distance, uy = dx / distance;
    const shoulder = point(lerp(b.root[0], tip[0], .24), lerp(b.root[1], tip[1], .24));
    const polygon = Object.freeze([b.root, point(shoulder[0] + ux * width * .5, shoulder[1] + uy * width * .5), tip,
      point(shoulder[0] - ux * width * .5, shoulder[1] - uy * width * .5)]);
    return Object.freeze({ growth, attached: growth > 0 && time < b.releasesAt, fracture: growth > 0 ? clamp((time - b.releasesAt + .10) / .10) : 0, polygon, tip });
  } });
}
