# Projected magic seals

`arcane/rune-circle` now uses an engraved ritual-seal style. It keeps its original 136 × 100 canvas,
foot origin (68, 80), 4 s loop, palette and seed inputs. Use `runeStyle: "classic"` to recover the
original drawing, including its old non-periodic sparkle. The default no longer uses a broad vertical
haze, and does not share the material shading used by smoke, fire or liquid effects.

## Reusable geometry

`sigilArc(radius, start, end, tolerance)` returns an unsquashed circular path. Clockwise and partial
arcs work; a full turn shares its exact first/last point. Tolerance defaults to 0.18 logical pixels.
The implementation bounds chord error before perspective compression, requires at most one turn,
and rejects requests requiring more than 1024 vertices. Loose tolerances never collapse a circle.

`projectSigilPath(points, plane)` transforms authored `(x, depth, optional height)` vertices into
screen coordinates. `plane` supports x/y placement, in-plane rotation, perspective (0..1), and height.
It returns ordered front/back runs with shared crossing endpoints and cumulative screen-length
fractions `from`/`to`. Closing a path is explicit: repeat its first point. Inputs are not mutated.

- Physical depth, not final screen y, decides the layer. A raised foreground rune can be above the
  horizon while still going in front of a character.
- Split runs are separate paths. Never discard back points and connect the remaining front points.
- Use each run's global `from`/`to` when fading a trail. Restarting its fade at a depth crossing causes
  a visible gap or a new hot spot.
- Geometry does not choose a color, add glow, or impose an effect style. Draw author-controlled hard
  palette strokes with `Painter.path`, then optional low-strength `glowPath` for emissive materials.

## Rune circle motion

Eight upright sigils keep readable counters rather than squeezing tiny glyphs into the floor plane.
A quarter-turn loop is possible because the two-symbol alphabet repeats four times. The geometry
also has fourfold symmetry; wrapping time alone is not enough to repair a shape that jumps at the seam.

Two readers turn twice per loop while the runes turn a quarter turn. Matching rune contacts occur at
`(1 + 4*j) / 7` seconds for `j=0..6`, with an opposite pair at each contact. Those positions emit the
rising script. Secondary motes follow their actual curved, lifted paths and split at physical depth.

## Review and compatibility evidence

1. Baseline: a direct t=0/t=4 render differed at 18 color pixels; wide purple haze obscured open space,
   and the small glyphs and mostly empty center were weak at native scale.
2. Pass one: introduced twin rails, separate standing sigils and depth-aware geometry. Decoded GIF
   inspection showed too many overlapping glyphs at the side and a cluttered center.
3. Pass two: reduced twelve raised marks to eight larger runes, shortened the compass shapes, and
   restored central negative space. Replaced the elongated center diamond with a truly fourfold shape
   so the near-seam frames also match the intended quarter-turn motion.
4. Pass three: tied script emission to reader/rune contacts, split rising mote trails at physical depth,
   and inspected the recolored, mirrored version over a light background.

`tests/sigil-quality.test.mjs` covers geometry and input bounds, clockwise arcs and chord tolerance,
per-point height, exact front/back crossing endpoints, all 121 original classic frames, direct period
identity in both layers, near-seam motion, deterministic seek/recolor/seed behavior, native silhouette
bounds over four seed/flip cases, light=0, and runtime stop fading. No renderer or exporter was changed.
