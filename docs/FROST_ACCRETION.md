# Attached frost and brittle release

`ice/frost-beam` stops a ribbed, refracting jet at an intact metal plate. Cooling runs up and down the receiving face, then fern-like ice branches grow outward. The smallest tips crack first, followed by their supporting trunks. Fallen ice uses the existing polygon-aware `glassShardPath` to tumble, make actual floor contacts and settle. The receiving metal is never turned into generic debris. Cold residue is non-emissive after the beam.

## Reusable accumulation

`frostAccretion2D(contact, options)` fills a gap between a contact event and a generic particle burst: persistent attached growth. It consumes the immutable `ImpactContact2D` used by the projectile and exported metadata. The contact normal points out of the surface, and its tangent defines the receiving line.

- Root coordinates lie exactly on the receiving line, within `halfSpan` of the contact.
- Cooling takes `distance / spreadSpeed` seconds to reach each root.
- Child branches do not start until the parent's tip reaches their attachment.
- Growth is capped at `exposure` seconds after contact. A short pulse leaves distant branches unbuilt, rather than making them finish after the source is off.
- `sample(index, time)` returns growth, the grown polygon, attachment state and the last 0.1 seconds of fracture progress. It is independent of update order, frame rate and random draws during rendering.
- Children release before their parent. The sampled polygon is retained after release, so motion can reuse the exact shape instead of replacing a branch with a generic diamond.

The helper validates and copies authored input, freezes returned geometry, and uses seeded topology. Options are `seed`, `count` (3–32 roots), `halfSpan`, `length`, `exposure`, `spreadSpeed` and `hold`. There are two children per root.

This is art-directed growth on a straight receiving line, not a thermal simulation or arbitrary mesh collision. The host owns collision discovery and material eligibility. A curved or moving target needs its own attachment mapping. Shade frost with the effect palette, preserve the receiver material, and do not add hot sparks, stone dust or a universal shock ring.

## Render and validate

```sh
npm run build
node build-tools/tools/render.mjs ice/frost-beam --gif --sheet --scale 3
node build-tools/tools/check.mjs ice/frost-beam
node --test tests/frost-quality.test.mjs
```

`surface: false` omits the receiving plate and its coating for integration with a game-owned target; the outward frost branches and falling flakes remain. The exported contact is still local `[64, -45]`, with normal `[-1, 0]` and material `metal`. The beam arrives at `FROST_BEAM_CONTACT_TIME` (0.48 seconds) and switches off at `FROST_BEAM_OFF_TIME` (1.34 seconds). Camera shake is not added. `power` and `roots` have bounded ranges; `palette`, `surfacePalette`, seed, mirror and standard transforms are supported.
