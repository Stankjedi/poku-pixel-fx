# Sloped particle ground contact

`Particles({ ground: x => floorY })` uses local pixels with screen y increasing downward. `SPARK`,
`GRIT`, and `BRAND` now compare each moved particle with the ground at its new x rather than treating
the previous x's ground height as a flat plane.

For a continuous finite slope, the crossing is found along the same analytic gravity/drag trajectory
with a bounded 28-iteration bisection. Sparks reflect around the local normal; grit reflects or settles.
A brand's `onLand(x, y)` receives the actual surface intersection. Spark trail history resets at contact
so that the next trail cannot rewind through the floor.

```ts
const particles = new Particles({
  seed: 7,
  ground: x => -0.35 * x,
  onLand: (x, y) => blazes.add(x, y - 0.25, 1.2, 0.7),
});
```

The `ground` callback must be pure and deterministic. Detection can evaluate it several times,
including 0.001 pixels either side of contact to estimate the normal. Do not consume random numbers,
advance time, or modify terrain in this callback. The intersection search itself consumes no RNG.

## Compatibility and scope

- Identical heights at the two step endpoints retain the exact original flat-floor response.
  No public API, default options, flat-ground motion, child-particle creation order, or RNG order changes.
- Continuous finite height fields are supported, not arbitrary rigid-body collision. Narrow ridges
  between two above-ground endpoints, equal-height endpoint terrain variations, multiple crossings
  in one step, discontinuous walls, holes, overhangs, and moving terrain require another collision model.
- A sloped collision stops the step at its contact. Neither this response nor the legacy flat response
  integrates the post-bounce remainder. Use small updates; `createFx` already steps at 1/120 s or finer.
- `Bits`, specialized stone/ice helpers, simple `core/particles` lists, and the 3D engine are unchanged.

After building, run:

```sh
node --test tests/particle-ground.test.mjs tests/particle-quality.test.mjs tests/shared-quality.test.mjs tests/catalog-quality.test.mjs
```

Tests cover both slope directions, uphill motion with upward screen-y velocity, false downhill hits,
analytic landing coordinates, grit settling, clipped trails, curved terrain, flat-floor compatibility,
and delayed births.
