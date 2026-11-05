# 2D time, placement, and body composition

These contracts address I02, I04, I16, and the 2D effect bounds/lifetime portion of I18 in the 2026-11-05 improvement report.

## Time

`createFx.update(dt)` accumulates non-negative elapsed seconds. `t` is continuous presentation time; `tick` is the number of completed simulation steps, and `simulatedTime` is `tick / 120`. Stateful implementations receive **only `1 / 120` seconds per update**. A host update shorter than a tick remains pending until a complete tick is available. An update longer than a frame runs every pending tick: the engine does not cap catch-up steps or discard time.

The presentation clock uses compensated summation. Numerical noise within `1e-12` seconds of a tick boundary is normalized to that boundary, with the correction retained for later accumulation. A draw can use presentation time for procedural animation, but must not advance simulation or consume persistent RNG state. For comparing state, compare `tick` and use the same seed/options. For comparing a fully rendered frame, use the same presentation time as well.

Chains use the absolute `advanceTime` scheduling hook to receive continuous parent time, including a cue's exact release between simulation ticks. They forward only each child's exact active interval. The child keeps its own pending fractional tick; its presentation phase and cue position stay current without any simulation or creation during drawing. An implementation with `advanceTime` is a timeline scheduler and must delegate stateful simulation to child `createFx` instances; ordinary stateful effects continue to implement `update`. Cue fade progress is normalized to `1e-12` before smoothstep so decimal midpoint subtraction does not turn exact half coverage into 127 instead of 128. Transform, palette, and light inheritance are unchanged.

### ACT contact timing

ACT preserves exact authored event times, including contacts that are not multiples of `1 / 120`. Hit-stop consumes wall time at the contact; simultaneous hits share the longest freeze. Its public clock remains continuous. Target springs, debris, and ghost history integrate only at fixed timeline ticks or authored event/loop boundaries. An event may therefore create a shorter integration segment, but a host frame cannot: the segment sequence is independent of 60/120/144/165 Hz or variable host updates. Physics may be up to one pending tick behind presentation time between boundaries.

## World placement

`Painter.place(x, y)` takes **world coordinates**. `PaintFrame.ox/oy` place the top-left of the frame in the same world. Array indices subtract that origin once. Moving the actor and frame origin by the same integer offset preserves the pixels; changing only the frame origin selects a different crop of the same scene.

## Body composition

The stock ACT body attachment path uses two independent temporary layers:

1. Back effect color/light.
2. Standing actor plus front effect color/light.

It transfers the back layer once, maps body pixels onto the posed actor, then transfers front pixels outside the rest body once. All color transfers use the common straight-alpha `blendOver` operation. The back layer is never precomposited into the front layer and then applied a second time.

When the destination has `hdrLight`, both temporary frames keep linear RGB light too. The pose displacement, accumulation, and ghost occlusion applied to packed light also apply to HDR. HDR is copied from the original linear source; it is not reconstructed from the saturated packed mirror. In this 2D path, effect light is authored additive glow, rather than opaque 3D surface emission.

Temporary frames cover the effect's native bounds plus a light halo and the source cells needed by the actor pose. They intersect the relevant output crop, including the displacement needed to move a source pixel into view. Thus a larger viewport does not force every small status effect to allocate and scan two full-screen images. The default working halo is half the larger native canvas dimension. Effects whose glow intentionally extends farther can set `act.scratchPadding` in native pixels. This working halo does not change export canvas sizes or the effect's pivot.

## Thin lines

Thin lines and paths skip invisible major-axis Bresenham steps. The first visible step reconstructs the original raster error and keeps the original interpolation coordinate `u`. This preserves tie decisions, pixel phase, and gradients. Clipping does not move endpoints to the frame edge or stretch a gradient over the remaining visible section.

## Individual canvas/lifetime corrections

The original report's saved checker bounds determined these directional extensions. Effect geometry, particle counts, and timings stay authored as before.

| Effect | Canvas change | Pivot change |
|---|---|---|
| `fire/meteor` | Height 232 → 233 | None |
| `ice/icicle-fall` | Width 152 → 155 | None |
| `lightning/ion-stormburst` | Width 232 → 234 | None |
| `melee/spin-slash` | Width 208 → 209 | None |
| `melee/uppercut` | Width 132 → 133 | X 48 → 49 to retain the leftmost pixel |
| `nature/earth-spike` | Width 272 → 273 | None |
| `nature/healing-bloom` | Height 120 → 122 | Y 108 → 110 to retain the upper two pixels |
| `nature/prismatic-blossom` | Width 268 → 270 | None |
| `ui/crit-number` | Height 120 → 129 | None |
| `ui/health-bar-hit` | Height 64 → 67 | None |
| `moves/earth-stomp` | Width 290 → 294 | X 50 → 54 to retain the four leftmost pixels under the fixed child clock |

`shadow/curse` retains its 3.4-second one-shot duration. Its last 0.24 seconds dissolve remaining impact dust so both color and light are clear at the deadline. This is an effect-specific finish, not a global rule that deletes all persistent final states.

The focused regression cases live in `tests/report-2d-contracts.test.mjs`; existing contact timing and catalog checks remain part of final integration verification.
