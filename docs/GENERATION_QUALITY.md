# First-generation VFX quality

Aim for a strong first complete generation. Repeated cosmetic edits to an unsuitable old effect
are not a substitute for designing the right composition at creation time. Pick the visual language,
subject silhouette, camera/readable scale and motion before writing detail particles.

## New effects start with layers

```sh
node build-tools/tools/new.mjs fire/my-effect          # rooted fire plume example
node build-tools/tools/new.mjs ice/my-effect           # rigid crystal breakup example
node build-tools/tools/new.mjs scifi/my-effect         # directed energy pulse example
node build-tools/tools/new.mjs water/my-effect         # falling water and spreading pool example
node build-tools/tools/new.mjs lightning/my-effect     # branched electrical strike example
node build-tools/tools/new.mjs fire/palette-study --cinematic
node build-tools/tools/new.mjs ice/palette-loop --cinematic --loop
node build-tools/tools/new.mjs arcane/my-loop --loop
```

Plain `new` uses five explicitly declared **category starting examples**, reusing the existing
structured material/action renderer rather than recoloring the same luminous body:

- `fire`: rooted, upward fire plume (`fire/plume`, then dissipation).
- `ice`: a solid crystal fractures into its own rotating/falling pieces (`ice/shatter`).
- `scifi`: a directed energy pulse (`energy/dash`, then dissipation), not an implicit explosion.
- `water`: a finite gravity-driven pour feeding a shallow spreading pool (`water/pour`).
- `lightning`: a brief branched discharge followed by a weaker same-channel repeat (`lightning/strike`).

These are named examples, not an interpretation of the effect name or a claim that a category has
only one meaning. The CLI names the selection and saves its full `.generation.json` plan. Explicit
`--material` / `--action` requests always override category selection. An arbitrary creature, shield,
beam, or custom action still needs an authored recipe rather than substituting these examples.

`--cinematic` deliberately selects the previous **generic luminous-source study** with a changing body,
ribbons, sparks, remnants and localized light. Its category selects palette only. Unmapped categories
also retain that generic starter; no unsupported physical behavior is inferred. `--minimal` and
`--timing` keep their existing learning examples. Previously saved effect files are not changed.

The mapped material examples are one-shot. `new fire/... --loop`, `new ice/... --loop`, `new scifi/... --loop`
`new water/... --loop` and `new lightning/... --loop` now reject before creating any files instead of silently returning a generic
palette loop. Only use `--cinematic --loop` when that generic study is intended. Explicit semantic
options cannot be combined with `--cinematic`; the ambiguous combination now rejects instead of
silently favoring one. Material-specific loop recipes are not newly implemented by this routing fix.

The generic study primary uses the existing kinetic stream body, now turned along the actual geometric path tangent.
It has unequal travelling lobes and palette-stepped material structure instead of two fixed four-point
polygons that always face right. Births sample the same changing rear surface and inherit source
motion. The geometric tangent stays defined when the one-shot source comes to rest. Particle counts,
lifetimes and light budgets are unchanged. Larger native primary coverage is intentional; this is not
an upscaled preview or a promise of a finished subject.

Generic loop starters opt into `createKineticBody2D({ period })`. The period, 0.01..3600 seconds, makes internal
time-dependent deformation use integer harmonics and makes material noise follow a closed orbit.
This avoids resetting an arbitrary nonperiodic shape at the wrap. Caller-supplied position, angle,
size, progress, opacity and burnout must also repeat for a complete effect to loop. Omitting `period`
preserves prior core output. Surface queries use the same cyclic shape/shader. This is analytic
periodic animation, not physical fluid simulation. Source-bound surface queries add instance-creation
work; do not infer target-hardware performance from the authoring preview.

The template is an editable **composition**, not an automatic interpretation of the name. Replace its
small moving crest with the intended subject before detail work. A phoenix needs an articulated head,
body, wings, separated flame-feathers and directional flight. A plume needs a source, buoyant body and
turbulent crown. A sword slash needs a blade-driven arc. A generic explosion cannot stand in for all three.

### Compact matter in new arcane source studies

Plain one-shot `new arcane/name` reuses the existing energy-profile `createParticleVolume2D`
for its 80 main shed particles. It no longer paints each particle’s 0.2-second history as two
long tapered bands. Source positions, velocity, births, life, sizes, primary body and connecting
source trail, 100 sparks, 32 embers and original single head-light calls are unchanged. The
finite footprint changes coverage and color; this is not a claim of identical alpha pixels.

The original `--cinematic` source study, all loops, `--minimal`, `--timing`, explicit material
requests, other categories and previously saved files retain their existing output. This is
an application of an existing renderer, not a new material/action category. The template helper’s
optional fifth `particleForm` argument (`'volume'`) selects this one-shot composition; omission or `'ribbon'`
retains the old source exactly. A volume loop is not implemented and rejects.

Native dark/light and no-light comparisons over three seeds show a modest improvement over
both the original long ribbons and a simple shorter-history control: compact multi-pixel matter
remains subordinate to the head. Short paired slivers and shard-like late fragments can remain.
It is still a generic violet energy-comet study, not a specific spell inferred from its name.
Full-speed playback is unreviewed; no formal artistic readiness or Niagara-level guarantee is made.

## Compose generated materials without copied effect modules

A `kind: "sequence"` project now accepts `source: { kind: "generation", intent, renderOptions? }`.
This connects the existing material-specific generators to the existing sequence placement, cue times,
fades, layer visibility, stable cue seeds and project export. At an exact absolute sequence timestamp computed as `cycle * sequenceDuration + (cue.at + event.at)`, generated cues sample their authored event time for both drawing layers. This avoids subtraction roundoff at event boundaries without rounding neighbouring times or changing simulation ticks. This presentation rule applies only to typed generated sequence sources, not generic chain effects or enclosing nested scheduler clocks. The event sum is formed before adding the cycle offset; no tolerance is applied to other representable timestamps. It does not add a new timeline,
particle renderer, event binding or automatic art-direction system. Existing files/defaults are unchanged.

Use the two runnable JSON projects and source contract in [SEQUENCES.md](SEQUENCES.md):
`generated-energy-fracture` aligns an energy arrival with rigid ice breakup; `generated-storm-fire`
starts a rooted fire preparation at a lightning arrival. Timing and positions are authored numbers,
not automatically updated dependencies. `intent.seed` is rejected because the existing cue owns the seed.
Generated event payload positions remain source-local; only cue event times and ids are remapped.

Omitted `renderOptions` preserves `createGeneratedEffect2D`'s legacy `body` artwork. The examples
explicitly select `material-volumes` for supported fire/energy and `crystal` for ice. This is intentionally
not another copy of `new.mjs`'s starter-selection policy. A connected authoring control is useful even
without improved artwork; no automatic quality or Niagara-level claim follows from these tests.

## Meaning controls the first sequence

### Branched lightning, not a traveling projectile

Plain `new lightning/name` selects the bounded `lightning/strike` example. Explicit options are
`--material lightning --action strike` or `--material 번개 --action 낙뢰`. Other lightning actions,
terminal bursts, dash controls, material-volume composition and semantic loops reject. `--cinematic`
keeps the old palette-only study. Previously saved lightning and all other effects are untouched.

Seeded, persistent channels combine irregular large bends with small deviations. Unequal rooted
forks remain subordinate to one main channel. A dim downward leader establishes path extents; the
brief return-current front and residual cannot illuminate an unestablished branch. A weaker second
pulse reuses the trunk without bright side branches. Fixed afterglow fades to empty, rather than
becoming a flying glowing body. Existing 2D path and local-light primitives are reused.

The 0.95-second sequence deliberately stretches atmospheric timing. The 8 ms return sweep falls
between native 40 fps samples, so ordinary playback shows it as essentially instantaneous. The
receiver has only a local flash, not invented smoke, debris or destruction. No surface scene is
provided: the most reliable reading is an isolated branching discharge, not proven ground impact.

Layer flags isolate `body` (trunk), `trail` (forks), `residue` (afterglow), `response` (receiver flash)
and `light` (emission); `sparks` is inert. Custom palettes remain art direction, not measured spectra.
Native dark/light/pattern/ink evidence supports electrical identity; thin branches are subdued on
light backgrounds. Full-speed playback is not independently reviewed. This is a bounded starter,
not a physical discharge solver, general lightning generator or Niagara-quality certification.

References verified as text: [NSSL lightning types](https://www.nssl.noaa.gov/education/svrwx101/lightning/types/),
[NWS dart leaders](https://www.weather.gov/safety/lightning-science-dart-leaders), and
[NWS high-speed timing examples](https://www.weather.gov/safety/lightning-science-slow-motion-flashes).
External photo/video pixels were unavailable from connected tools and were not claimed as viewed.

### Falling water, not a luminous palette alias

Plain `new water/name` now uses the bounded `water/pour` recipe. Explicit generation also accepts
`--material water --action pour` or `--material 물 --action 붓기`. Other water actions, terminal bursts,
dash controls and semantic loops reject before file creation. `--cinematic` remains the old generic
palette-only study, and previously saved water effects are not rewritten.

The elevated finite source feeds one continuous stream. Each birth time has correlated unequal
lateral momentum and width. The visible body, detached droplets and landing reactions sample those
same ballistic parcels through `liquidMotion` and `liquidImpactTime`. Downward speed increases, the
stream narrows, and source cutoff propagates toward contact rather than fading the entire curve.
The first and last parcel anchors match the public plan events exactly. The receiving pool widens
only after contact; late drops settle while surface traces spread and thin into the receiving plane.

Partial alpha and short palette-color reflections imply transparent water. Both light buffers remain
zero: this is not blue fire, additive bloom or scene refraction. Only this new material dispatch uses
the recipe. Existing fire/energy/ice recipes and their composition defaults are unchanged.

Native evidence across three seeds and dark/light/checkered backgrounds supports the bounded water
reading and source-to-contact sequence. The stream can still look narrow/angular, the pool is simple,
and splash detail is restrained. Full-speed playback is unreviewed. This does not establish Niagara
quality, physical fluid simulation, arbitrary water actions or a generic natural-language generator.

### Explicit translucent crystal surface

New authored ice drafts can select `createGeneratedEffect2D(plan, { iceSurface: 'crystal' })`.
This is an opt-in, stylized transmitting crystal surface: coherent front/bevel normals, material-local
finite fissures, thickness-dependent alpha and selective fixed-light reflections replace the opaque
triangle fan. The rigid partitions, release clock, gravity, spin, lifetimes and grit are unchanged.
It does not emit light, sample/displace the background or simulate optical refraction.

Omission and `iceSurface: 'facets'` retain the existing artwork exactly. CLI starters, fire/energy
compositions and existing saved source defaults are unchanged; explicitly save this option in a new
module to reuse it. It is not accepted on fire/energy or with an ice-incompatible volume composition.
`createCrystalSurface2D` is also exported by the core API for authored convex matter and its parts.
The original material coordinates remain attached when a fragment translates or rotates.

Native comparison across three seeds and dark/light/patterned backgrounds shows less opaque-paper
shading and clearer transmission. The result still reads as stylized glass/crystal, not proven natural
frozen ice. Dark-background fragments are subdued and bright-background pieces can remain sheetlike.
Full-speed playback must still be reviewed before claiming motion quality. This option is not a reason
to replace older artwork or silently change new-starter defaults.

For supported actions, choose the material, action and requested response **before** source generation:

```sh
node build-tools/tools/new.mjs fire/charged-dash --material 화염 --action 돌진 --response 폭발
node build-tools/tools/new.mjs fire/living-plume --material fire --action plume
node build-tools/tools/new.mjs arcane/energy-burst --material energy --action burst
node build-tools/tools/new.mjs ice/crystal-break --material ice --action shatter
```

To set the initial plan while creating a new source, add `--seed`, `--distance` and/or `--travel`:

```sh
node build-tools/tools/new.mjs scifi/short-pulse --seed 17 --distance 64 --travel 0.45
node build-tools/tools/new.mjs fire/slow-dash --material fire --action dash --seed 17 --distance 144 --travel 1.2
```

`--seed` is an integer from 0 through 4294967295. `--distance` is 24..160 native pixels and
`--travel` is 0.25..3 seconds; these two controls require a dash. They work with explicit
material/action inputs or the declared `scifi` energy-dash example, and never infer an action
from the effect name. Seed also works with other declared material examples. Generic-template generation,
`--minimal`, `--timing`, `--cinematic` and `--loop` reject these plan controls rather than ignoring them.
Omitting them preserves the existing defaults. Invalid input is rejected before creating source,
intent, plan or registry entries, and an existing effect or plan is never overwritten.

Both the new source and its companion plan record the resolved inputs. Existing `render --seed`
and runtime seed overrides remain available for previewing a different take; those overrides do not
rewrite the saved plan. This bridge saves manual source/plan synchronization and makes requested
travel and arrival timing available at creation. It does not change particle laws or automatically
improve material quality.

These inputs generate an editable module and `authoring/<id>.generation.json`:

- `material`: `fire` / `화염` / `불꽃`, `energy` / `에너지`, `ice` / `얼음`, `water` / `물`, or `lightning` / `번개`.
- `action`: fire/energy use `dash` / `돌진`, `burst` / `폭발`, or `plume` / `분출`; ice uses `shatter` / `파쇄` only; water uses `pour` / `붓기` only; lightning uses `strike` / `낙뢰` only.
- `response`: `burst` / `폭발` or `dissipate` / `소멸` / `잔열`. Default is `dissipate`.
  A terminal burst is available only after `dash`; requesting it on an existing `burst` or a plume is
  rejected instead of silently inventing another action. Semantic generation is one-shot and cannot
  be combined with `--loop`, `--timing`, `--minimal` or `--cinematic`.

The material is explicit and wins over the folder's organizational category. Fire carries a delayed,
non-emissive cooling residue after a burst; energy does not borrow smoke. Dash travels along a source
path, plume emits upward from a fixed base, and burst expands from one fixed origin. The requested
terminal response begins at the dash's exact arrival position and time. Primary body termination,
emission stop, arrival and burst export events share the same plan, rather than independent guessed
clocks. No struck target, contact material, camera shake or explosion is assumed when not requested.
`source-emission-end` marks the main source's cutoff; `emission-end` occurs after all new emission,
including the short terminal burst. Particle deaths happen later during the dissipation interval.

The fire plume's main shapes reuse the thermal-ribbon primitive: unequal length/width and lifetimes,
growth, transported hot crests, forked tips, consumed roots and detachment. They are not five held
feather-shaped polygons recolored in place. This provides temporal shape variation at generation time;
it does not by itself create a believable phoenix wing or certify its aesthetic quality.

This is a bounded **structured vocabulary**, not a general natural-language parser. Exact Korean and
English aliases are supported; prose such as `폭발 없이` is rejected instead of accidentally triggering
an explosion because it contains `폭발`. A phoenix, arbitrary creature, fluid or custom physical
interaction still needs authored primary geometry. The plan is intended design data, not proof of
observed meaning, viewing, physics or user approval. The separate intent brief remains a draft.

The reusable `poku-pixel-fx/authoring` API exposes `parseGenerationMeaning2D`,
`createGenerationPlan2D`, `resolveGenerationPlan2D`, `generationSource2D` and
`createGeneratedEffect2D`. `createGenerationStarter2D(category, seed?)` reuses those APIs and returns
a frozen `{ selection: 'category-example', category, label, plan }` for exact `fire`, `ice`, `scifi`, `water` or `lightning`
keys, or `undefined` for an unmapped category. It does not parse effect names, prose or negation, and
does not imply a loop. Editors can use this same bounded selection instead of adding their own
palette-only fallback. Edit `generation.intent` inputs in the generated source and recreate the plan. For dash, `distance` (24..160 native pixels) and `travel` (0.25..3 seconds) adjust the entire causal
sequence; a reloaded plan with conflicting derived event times or anchors is rejected. Its event
payload coordinates are effect-local and must be transformed by a consuming host when needed.

Generated modules preserve seed, palette, parent placement and exact empty endings. Optional
`layers: { body, trail, sparks, response, residue, light }` flags support diagnosis; setting `light:false`
also disables emitter glow. Seed, palette and layer flags are snapshotted at instance creation; create a
new instance after editing them. They are not an automatic aesthetic score.

### A primary form before fine particles

The fire/energy structured generator uses `createKineticBody2D` for its primary matter. Native-size comparisons
exposed a shared weakness in the previous starter: dash used a rigid diamond, burst was twelve thin
spokes with an empty center, and the energy plume was repeated pointed polygons. More particles or
glow would not repair those silhouettes.

The new opt-in primitive draws a connected implicit union with a palette-stepped material field:

- `stream` has a leading mass and unequal lobes that travel toward the tail, with zero-size birth/death
  envelopes at wrapping phases. It follows the source path's tangent.
- `burst` expands an overlapping body with unequal supports and a sustained center. Expansion phase
  changes its proportions independently of overall radius; it is not a fixed star scaled outward.
- `plume` has a broad fixed source plane and a narrower, unequal crown. It is not a rotated projectile.
  Its primary body remains present while the source is fueled, independently of each detached flame's
  consumed root. Staggered particles alone are not used as a guarantee of continuous fuel coverage.
- Fire uses an evolving clustered field; energy retains cleaner geometric supports and bands. With the
  same palette and no particles/light, these materials still produce different primary buffers.

```ts
const body = createKineticBody2D({
  seed: 17, material: 'fire', profile: 'burst',
  palette: ['#fff1ac', '#ffb238', '#f76a19', '#b93316', '#57151b'], // hot to cool
});
body.draw(painter, { time: seconds, position: [x, y], size: [radius, radius],
  progress: expansionPhase, opacity: fade });
```

`size` contains longitudinal/transverse half-extents in native pixels (positive, up to 512 each);
`angle` rotates the forward axis. `progress` and `opacity` are 0..1. The caller supplies life/phase
clocks; this primitive does not invent impacts or events. `sample(state)` exposes normalized lobe
supports for diagnostics, not a physical surface solver. Palettes are copied at creation, constant
alpha is preserved, and this renderer adds no light. Its cost depends on covered area and overlap.

### Fire consumes material instead of uniformly fading a disk

`KineticBodyState2D.burnout` is an opt-in 0..1 fire-only fuel-depletion clock. Omission or zero
preserves the previous shader exactly. A seeded, continuous field in normalized material coordinates
removes coherent regions as the clock advances. Surviving consumption edges retain a small hot band
from the existing palette. There is no per-frame randomness, color blur or additional emission.
At fixed normalized coordinates, consumed fuel cannot return as burnout increases. This does not mean
fixed world pixels remain empty: the caller can still expand, deform or move the body.

New structured fire bursts, including requested terminal bursts, enable this after their short emission
window and drift the remaining body upward. Energy, ice, fire dash without a burst, fire plumes and
existing catalog artwork are unchanged. Events, sparks, residue and light budgets stay the same.
The change addresses a specific observed weakness: late fire bursts previously retained one solid
brown rosette until uniform alpha removed it. It is an authored depletion field, not fluid simulation,
heat transport, volumetric smoke or a guarantee of finished artistic quality. Some seeds briefly form
round holes or ring-like remnants; the existing round smoke residue remains a separate limitation.

`sampleSurface` traces the same remaining material. With opt-in burnout, a ray may contain no matter;
that ray throws `RangeError` instead of inventing a surface at the origin. A fully consumed body draws
nothing. Stop emission or handle absent rays when using this control in a custom emitter. The built-in
burst finishes emission before burnout starts, preserving its original particle birth frames.

### Surface birth frames

`body.sampleSurface(state, u)` queries the changing **exterior union**, including the same material
boundary used by the primary renderer. It returns `position`, outward unit `normal`, and unit
`tangent` in the supplied state's coordinate space (usually effect-local). A later Painter parent
transform is not included. Nonuniform size and rotation are included in the normal transform. `u` is a normalized
angle, not a uniform arc-length/area coordinate; `u = 1` aliases `0`. Opacity is intentionally ignored.
The outside-first interval trace resolves radial intersections to 1e-7 normalized units. It is an
emitter placement query, not a complete contour mesh or a fluid solver.
Use it while baking births, not inside every particle's trail/draw callback.

```ts
const sparks = createCinematicParticles2D({
  count: 170, seed: 17, palette: hotToCool,
  start: impactTime, duration: 0.08, life: [0.24, 0.85],
  emissionFrame: (birth, id, u) => {
    const surface = body.sampleSurface(bodyStateAt(birth), u);
    return { position: surface.position, direction: surface.normal,
      inheritedVelocity: surfaceVelocityAt(birth, u) };
  },
  speed: [48, 130], spread: 0.65, style: 'spark', emission: 0.065,
});
```

`emissionFrame(birth,id,u)` snapshots position, outgoing direction and optional inherited velocity
**once per birth**. It cannot also set `source`, `inheritedVelocity` or `angle`. Direction must be
finite and nonzero; magnitude does not alter speed. `spread` is centered on that direction. All
returned vectors are copied. The legacy source/angle path and its random sequence remain unchanged.

New structured dash effects shed from their changing trailing surface and keep the source's partial
momentum. Bursts eject from the expanding boundary in unequal seeded sectors plus a sparse full
perimeter, rather than a uniformly decorated ring or a bright knot buried in the center. These are
bounded artistic motion choices, not calculated momentum conservation. Plumes retain their fixed
fuel source. This change adds no particles, light intensity, body geometry or timing events.

Surface queries add **creation-time CPU work**. Direct-time rendering uses only baked trajectories,
including reverse seeks, and never retraces the body for existing particles. Benchmark creation and
drawing separately and pre-create instances outside latency-sensitive gameplay; this is not a GPU
or real-time guarantee.

Only newly generated structured compositions use it automatically. Existing catalog artwork and the
separate phoenix example are unchanged by this addition. Their particle counts, light budgets and
sequence events were not increased to make the comparison appear richer. The result is a stronger
editable starting form, not a promise of finished art or commercial-engine realism.

Before the first complete render, decide:

1. **Primary form:** the subject reads at native size with light disabled. Keep a dark edge, midtone body
   and a small hot crest. Reserve empty gaps between major forms.
2. **Attached versus detached:** authored primary surfaces follow the subject. Ribbons and sparks shed
   from those surfaces at birth and retain source motion; old particles must not teleport with the source.
3. **Three scales:** use a few broad flowing structures, medium flame/ribbon clusters and fine sparks.
   Distinct sizes, lifetimes and velocities make richness without indiscriminate screen-filling noise.
4. **Energy hierarchy:** put most energy in the intended focal region. Use explicit emission and a bounded
   per-particle light budget. Raising all glow values erases color and negative space.
5. **Timing:** preparation, main action and dissipation serve this specific subject. Particle emission stops
   before the final frame, allowing cooling and fading while motion continues. Do not add an impact if none exists.

An Unreal/Niagara-like request is a visual direction: layered emission, flowing ribbons, fine sparks,
depth overlap and luminous motion. This TypeScript CPU renderer is not Unreal, Niagara, a volumetric
fluid solver or proof of GPU performance. Use the real `CinematicCompositor` and HDR emission for
optional light-only bloom; never blur the color/silhouette buffer to fake resolution.

## Prepare the actual upcoming body

New structured effects use their material and action before release, rather than beginning every
sequence with the same pair of flat ovals. Native comparisons across fire/energy dash, burst and plume
exposed this as a shared preparation weakness, not a reason to add more global glow.

- Dash grows the actual directed stream silhouette into its launch pose. The geometric path tangent
  remains defined at exact release even though source velocity is zero there.
- Plume grows around its fixed root. It stays short before release, then reaches full height by
  release + 0.12 seconds, without a separate bright oval under a dim column.
- Burst gathers and compresses a compact irregular material core. Its sharp release flash remains
  intentional; preparation does not smooth away the blast.

`createIgnitionPose2D` is an opt-in, renderer-independent helper. It scales a supplied mature body
around a normalized local anchor and uses existing shape-preserving timing curves. Inputs are copied;
all scale keys are positive, strictly ordered from 0 to 1, and finish at scale [1,1]. Endpoints have
zero scale velocity. Opacity fades in over the first quarter of preparation. Sampling before `start`
returns undefined; at/after `end` it holds the mature pose, so the caller still owns lifetime/cutoff.
`fraction` is a preparation clock, not a kinetic burst's `progress` parameter.

```ts
const ignition = createIgnitionPose2D({
  start: 0, duration: 0.4, position: [0, -22], size: [22, 12], angle: -Math.PI / 2,
  anchor: [-1, 0], opacity: 0.9,
  keys: [{ at: 0, scale: [0.12, 0.4] }, { at: 0.7, scale: [0.32, 0.8] },
    { at: 1, scale: [1, 1] }],
});
const pose = ignition.sample(seconds);
if (pose) plumeBody.draw(painter, pose);
```

The normalized anchor is multiplied by the body's local half-extents and rotated with it. `[-1,0]`
therefore keeps a plume's base at the same position while its height changes. This is authored 2D
staging, not combustion, collision or automatic subject design. It invents no particles, light or
events. Existing catalog sources, palettes and the separate phoenix artwork are unchanged.

Rasterizing the actual body costs more than two ovals: one shared-cloud CPU comparison measured
preparation medians of 0.11–0.89 ms across the six cases, versus about 0.05 ms before. This excludes
allocation, compositing and export and is not a real-time/GPU guarantee. Post-preparation buffers in
24 sampled comparisons were exact matches. Native stills support the clearer starting forms;
normal-speed playback and user approval were not established by these tests.

## Continuous endings after source cutoff

The default structured `dash → dissipate` keeps the same primary body, terminal tangent and attached
trail at arrival. It then deforms, rises modestly for the chosen material and fades over 0.30–0.38s.
Head light follows the same terminal opacity instead of switching off in a separate frame. Emission
still stops at the original source cutoff; existing particle trajectories and event clocks are unchanged.
An explicitly requested burst retains its separate sharp response. No explosion is invented for a
plain dissipate response, and other generated actions and existing catalog artwork are unchanged.

`createDissipationPose2D` provides the reusable pose stage without choosing a renderer or emitting
particles. Inputs are snapshotted, sampling is independent of frame order, and the exact ending is
empty. The original renderer may continue its internal material motion with the returned absolute
`time`; this is not an unrelated symbol substituted at the source cutoff.

```ts
const ending = createDissipationPose2D({
  start: sourceCutoff, duration: 0.38,
  position: finalPosition, size: finalSize, angle: finalTangentAngle,
  drift: [0, -7], endScale: [0.55, 0.8], fadeStart: 0.1,
});
const pose = ending.sample(seconds);
if (pose) body.draw(painter, pose);
```

`drift` is total displacement in the supplied pose's coordinates; it defaults to `[0,0]`. `endScale`
scales the positive longitudinal/transverse size and defaults to `[0.65,0.85]`. `fadeStart` is normalized
in `[0,1)`. Position and size use smooth endpoint interpolation; opacity is one at the start, then
falls to zero. `sample()` returns `undefined` before start and at/after `end`. Its `fraction` field is
the handoff fraction, deliberately not a kinetic body's separate `progress` control. Callers retain
control of material clocks, phase and layers. This stages a pose that has come to rest; it does not
solve momentum, collisions, physical cooling or arbitrary transitions automatically.

Retaining real matter costs additional body raster work during the short ending interval. Measure
that window separately from moving frames, rather than averaging the added cost away. No extra
particles, increased light budget, palette replacement or changed semantic clocks hide the transition.

## Surface-bound cinematic particles

`createCinematicParticles2D` is exported from `poku-pixel-fx/core/index` and the root API.
It bakes emission once and evaluates analytic motion at any requested time. There is no simulation
catch-up, per-render RNG or callback that follows the current actor position.

```ts
const sparks = createCinematicParticles2D({
  count: 180, seed: 41,
  palette: ['#ffe8a1', '#ffac39', '#ee4d21', '#6b1e25'], // hot to cool
  start: 0.2, duration: 1.1, life: [0.35, 0.7],
  source: (birth, id, u) => sampleEmissionPath2D(wingEdgeAt(birth), u),
  inheritedVelocity: (birth, id, u) => wingVelocityAt(birth, u),
  speed: [20, 65], angle: Math.PI, spread: 1.1, drag: 0.8,
  size: [0.6, 1.2], style: 'spark', trailSeconds: 0.07,
  curl: { amplitude: 3, frequency: 1.2 },
  emission: 0.08, lightRadius: 3,
});
sparks.draw(painter, seconds, 'front');
```

- `source` and `inheritedVelocity` accept constant `[x,y]` or `(birth,id,u) => [x,y]`.
  Both receive the same absolute birth time and surface coordinate and run once per particle.
- Births are stratified across the emission window. Surface coordinates use a separate low-discrepancy
  sequence, so emission time does not sweep a visible line across a surface. Changing `count`
  intentionally redistributes births; use the same count and seed for identical results.
- `sampleEmissionPath2D(path,u)` samples **arc length**, not vertex index. Dense control points and
  zero-length segments do not collect extra particles. Animated paths are evaluated at birth.
- `style: 'ribbon'` draws two tapered palette bands along the real trajectory; `'spark'` uses a thin
  connected trail; `'ember'` uses compact cooling marks. No white is inserted into the palette.
- `curl.amplitude` is pixels and `curl.frequency` is revolutions/second. This is bounded, smooth,
  artistic rotational displacement, not a physical curl-noise field. Position and velocity are
  continuous at birth and `sample()` exposes the exact trajectory derivative.
- `end` is the last death time, and both alpha and light reach zero at death. Set the effect's duration
  after every emitter's `end`. Source callbacks are never re-evaluated during drawing or seeking.
- At most one localized light is drawn per particle, independent of trail sample count. Light is still
  additive across particles: use low emission for dense clouds and inspect for clipping.
- Counts are limited to 8192 per emitter and trail samples to 64. These are safety bounds, not realtime
  performance promises. Measure the actual composition, resolution and renderer before shipping.

Loops require periodic sources. The generated loop bakes one period, then renders current-period births
and surviving previous-period particles (`phase` and `phase + duration`). Its maximum lifetime is shorter
than its period. Do not simply wrap time for a nonperiodic source or a lifetime longer than one period.

## Living thermal forms

`createThermalRibbon2D` provides a different contract for attached flame shapes. Each birth has its own
length, width and lifetime. A head travels along the authored path, the root is consumed, the body swells
and narrows, and unequal daughter tips separate within the parent's lifetime. The material uses a
clustered thermal field inside these changing supports rather than fixed nested gradient polygons.

```ts
const flames = createThermalRibbon2D({
  count: 24, seed: 7, start: 0.2, duration: 1.3,
  palette: ['#fff1ac', '#ffb238', '#f76a19', '#b93316', '#57151b'],
  source: (time, id, u) => flamePathOnSurface(time, id, u),
  life: [0.45, 0.85], width: [2.4, 5.2], length: [0.65, 1.2],
  curl: 3, split: 0.75, attachment: 0, velocity: [0, -12], buoyancy: [0, -32], emission: 0.035,
});
flames.draw(painter, seconds);
```

`width` is a range of native-pixel half-widths; `length` multiplies the complete source path, and `curl`
is native pixels. `attachment` is the fraction of life that follows the source (default 0.6);
`attachment:0` freezes the source pose at birth. Optional velocity is evaluated at detachment, and
`buoyancy` is an acceleration vector in native pixels/second squared (default `[0,0]`). Released
displacement is velocity times elapsed release time plus half acceleration times that time squared.
Negative local Y is upward. The emitter's guide path must also describe the intended flow: an upward
acceleration alone does not turn a downward feather-shaped guide into believable rising fire.

The generated fire plume freezes each flame at birth and gives it upward velocity/acceleration. Its
separate primary body supplies continuous fuel coverage until the source shuts down. This keeps a
moving source from dragging old flames along and avoids depending on every individual root staying
attached. The new options preserve previous behavior when omitted; they are authored analytic motion,
not a fluid solver or a claim that every local flame pixel must move monotonically upward.
Unlike cinematic particles' birth-only callbacks, thermal callbacks are evaluated during seeking and
must be pure functions of the supplied time, id and surface coordinate. Constant paths and velocities
are copied at creation. `sample(time)` exposes changing supports for tests and diagnostics; `end` is the
last death time. Forks do not extend this lifetime. Counts are bounded, but raster cost still depends on
path area and overlap. This is an analytic stylized fire model, not a combustion simulation or a
real-time performance guarantee.

## Verify the first generated result

Run `npm run build`, `npm run test:generation`, and relevant effect checks. Inspect the actual first complete
render at native size, on dark and transparent backgrounds, and at intended playback speed. Check that
particle density supports the subject and that detached trails retain their origin. Record honest intent
and viewing evidence using `docs/EFFECT_INTENT.md`; technical tests do not establish artistic quality,
physical realism, user approval or similarity to a commercial engine.

## Rigid ice fracture at generation time

```sh
node build-tools/tools/new.mjs ice/crystal-break --material ice --action shatter
# Exact Korean aliases: --material 얼음 --action 파쇄
```

Ice/shatter is a separate supported pair, not a palette alias for fire. Other ice actions and
fire/energy shatter combinations are rejected. The implicit response is `dissipate`; a second
explosion, dash distance/travel, or loop is not supported by this recipe. The initial crystal shows
three broad material planes, then reveals the real fracture-cell facets/seams before release at
0.36 seconds. The same unequal cells detach from their original positions, rotate rigidly, and fall
under positive screen-down gravity. Their dimensions do not shrink; opacity fades near their
individual ends. A little short-lived grit is born on those cells. No flame ribbons, smoke,
self-emission, collision plane, bounce, refraction or hidden shock ring is added.

`body` controls the intact preparation, `response` the released pieces, and `sparks` the small ice
grit. `trail`, `residue`, and `light` remain accepted diagnostic flags but are deliberately inert for
this material. `shatter`, `release`, `source-emission-end` and `emission-end` use the same release
clock; the source and grit impulse are instantaneous. The recipe finishes empty at 1.51 seconds.

### Reusable convex partitions

`createFracture2D` is exported through the core/root API. Supply a strictly convex ordered polygon
(3..32 vertices in +/-512 local pixels), a dark-to-light palette (1..32 colors), and optionally
`count` (2..64), uint32 `seed`, `release`, positive `life` range, nonnegative `speed` range, `impulse`,
`gravity` and nonnegative `drag`. Clockwise and counterclockwise input are accepted. Concave,
self-crossing, repeated/collinear edges, area below 0.0001px² and malformed controls are rejected.
The seeded Voronoi partition preserves original area and gives each cell a fixed id, local vertices,
center, area, outgoing velocity, spin and life. Geometry is prepared once; arbitrary-time sampling
has no catch-up simulation or per-draw randomness. Small translated cells use local-coordinate
centroid and bisector calculations to avoid cancellation.

`sample(t)` holds the assembled body before `release`, then returns rigidly rotated/translated
cells with analytic velocity and opacity. Dead cells are omitted and `sample(end)` is empty.
`draw(painter,t,{opacity,cracks})` shades fixed planar facets and optional cell seams, without adding
light. `cracks` reveals existing boundaries; it is not a crack-propagation or stress solver. Lighting
is fixed in the effect's local drawing space, not a world-space dynamic-light solution. This helper
has no automatic initial fade, world collision, ground settling or translucency/refraction model.
It is opt-in and does not redraw existing catalog artwork. CPU measurements and actual native-size
inspection are still required, and technical tests do not establish finished-art quality.

## Shared particle flow and broken ribbon widths (opt-in)

A solid primary shape with extra sparks can still read as a single flat plate. New particle-led
artwork can instead use several emitter roles: short-lived bright roots, larger cooling wisps,
and sparse detached sparks. The shared features below support that construction; removing a
body or increasing particle count alone does not guarantee a better first result. Existing
core API defaults and saved effects remain unchanged. The newer CLI shed-material selection is
described below.

```ts
const flow = createCurlFlow2D({ seed: 41, scale: 28, strength: 35, drift: [0, -12] });
const wisps = createCinematicParticles2D({
  count: 180, seed: 41, palette: ["#ffb94b", "#ef712e", "#9d3024"],
  source: (birth, id, u) => [(u - .5) * 18, 0],
  start: 0, duration: 1.2, life: [.5, .9], speed: [30, 60],
  angle: -Math.PI / 2, spread: .5, gravity: -8, drag: .9,
  flow, flowStep: 1 / 120,
  style: 'ribbon', ribbonProfile: 'wispy', size: [3, 7], trailSeconds: .18,
});
```

Share the **same flow callback** between emitter roles to get related forces at the same effect-local
position and absolute time. `createCurlFlow2D` takes uint32 `seed`, main vortex `scale` (.25..4096px),
`strength` (0..10000px/s² coefficient), and a copied two-coordinate `drift` vector (each within
+/-10000px/s). It uses the perpendicular gradient of a seeded two-scale scalar noise field.
This is a stylized force, not an incompressible fluid simulation, scene collision, GPU execution,
or Unreal/Niagara integration. Particle IDs and independent sine phases do not define this field.

`flow(x,y,time)` may also be a custom acceleration callback. Birth source and inherited velocity
still work as before. `flow` is mutually exclusive with the old independent `curl` displacement.
`flowStep` requires a flow and accepts 1/240..1/30 seconds (default 1/120). Paths are baked at creation
using RK4; large drag automatically reduces the step so drag × step <= .25. A hard 500,000-step
budget per emitter is checked before field evaluation. Exceeding it rejects construction rather
than silently lowering quality or allocating unbounded storage. Total cost across many emitters
is still the author's responsibility. Sparse long-lived sparks can keep the cheaper ballistic path.

Interpolation uses endpoint positions and velocities; reported velocity is the derivative of that
Hermite path. Curl preparation reuses only the four exact lattice values in the most recently
sampled cell of each noise octave, and RK4 stages use scalar temporaries. This reduces repeated
hashing and allocation without changing force samples, time steps, integration arithmetic or
particle counts. Cache storage is bounded and does not quantize the field. Drawing, skipped frames and reverse seeks never re-run the field callback. Recreate an
emitter to change its field. This adds setup CPU/memory cost, so measure on target hardware before
making runtime guarantees. Strong custom forces can require a finer step; this is not an adaptive
solver. Finite but physically unreasonable force callbacks are still the author's responsibility.

`ribbonProfile:'wispy'` requires `style:'ribbon'`. It biases width along the trail and creates smooth,
seeded narrow sections/gaps rather than a repeated rounded capsule. Both lateral edges share that
width; it is not lateral asymmetry or a texture-map shader. It uses the existing palette, alpha and
light budgets, without extra blur or brightness. Omitted or `'smooth'` preserves the original width.
Native stills and full-speed playback are still needed: wider overlapping wisps can become a solid
mass, while extremely thin wisps can become a wire drawing. This feature does not author anatomy.

References: [Epic's Niagara Particle Update modules](https://dev.epicgames.com/documentation/en-us/unreal-engine/particle-update-group-reference-for-niagara-effects-in-unreal-engine)
separate curl force, inherited velocity, drag and scale over life; [Bridson et al., Curl-Noise for
Procedural Fluid Flow](https://www.cs.ubc.ca/~rbridson/docs/bridson-siggraph2007-curlnoise.pdf) describes
stream-function curl construction. These are technical references, not claims of equivalent rendering.


## Finite shed material for new fire/energy generation

The preserved `createGeneratedEffect2D(plan, { composition: 'volumes' })` mode, previously
selected by CLI fire/energy `dash` and `plume` recipes with `dissipate`, renders finite shed matter. Their detached matter is rendered as
short, unequal, evolving lobes in a shared spatial flow, rather than painting each particle's
whole trajectory. Sparse sparks remain ballistic. The continuous width-9 dash guide is omitted.
Primary bodies, ignition, source motion/inherited velocity, thermal supports, events and endings
remain authored as before, so the initial direction and source footprint do not depend on a few
randomly visible particles. Plume matter is born inside the burning source, above its source plane.

This selection is recorded in the generated TypeScript module, not in the v1 semantic plan JSON.
Keep the composition option with a plan when reproducing that module through the API. Omitting
it, or specifying `composition: 'body'`, preserves the previous output exactly. Existing saved
modules are not rewritten. Ice, burst/terminal-burst recipes, `--cinematic`, `--minimal` and
`--timing` are unchanged; asking for the volume composition on an unsupported recipe rejects.

The reusable core `createParticleVolume2D({ seed, profile, palette, emission?, lightRadius? })`
draws samples from `createCinematicParticles2D.sample(t)` or an equivalent independent source.
It uses only each sample's current position, velocity direction, size, alpha, age and life progress.
There is no history-length strip or implicit glow. `profile` is `fire` or `energy`; the palette is
1..32 hot/young-to-cool/old colors. Each id has bounded cached unequal lobes, continuous boundary
noise and progressive erosion. Input palettes are copied. Samples require id 0..8191, finite
position/velocity, size 0..128, alpha/progress 0..1 and age 0..3600 seconds. Optional single-head
light has emission 0..10 and radius greater than zero through 256 pixels. Zero size/alpha and
progress 1 draw nothing. Shapes and direct-time output are independent of prior draw order.

This is a bounded improvement to detached-material texture, not a replacement for authored
silhouettes or a fluid simulation. Fire and energy still share a comet-like dash composition;
matched-palette inspection shows that material identity remains limited. Native and adjacent-frame
comparison supported the narrower change after a body-free attempt regressed direction and flame
anchoring and was rejected. Full-speed playback and the broader high-initial-quality goal are not
certified by the tests. Shared flow also adds one-time CPU preparation cost; benchmark actual use.


## Material response for newly generated energy

New CLI fire/energy `dash` and `plume` + `dissipate` modules now explicitly serialize
`createGeneratedEffect2D(plan, { composition: 'material-volumes' })`. Fire is pixel-identical to
`volumes`. New energy replaces the persistent flame-like primary body with overlapping, unequal,
short-lived charged packets. The primary and detached matter share one local charge/spend law;
there is no separate smooth oval, continuous guide line, or history ribbon. Clusters compact and
briefly discharge through short local kinks before disappearing rather than cooling into a long
fire-like trail. A shared source field, event timing, palette and explicit light controls remain.

This is a new module selection, not a v1 plan schema change or a rewrite of saved artwork. Omitted
composition, `body`, and `volumes` retain exact previous output. Ice, bursts, explicit terminal
bursts and other CLI template modes remain unchanged. Unsupported material-volume recipes reject.
Keep the composition option with the plan when reproducing a saved module.

`createChargeVolume2D({ seed, palette })` is a reusable, seeded local renderer. The copied palette
contains 1..32 charged-to-spent existing colors; the helper adds no light or implicit white.
`draw(painter, { time, position, size, angle?, opacity?, progress?, id? })` accepts a finite dense
position vector, size radii greater than zero through 128 pixels, finite angle, opacity/progress
0..1, absolute time up to 3600 seconds, and id 0..8191. `progress:1` is exhausted. `sample(state)`
returns independent resolved state for inspection. Cached descriptors are bounded by the id range.
The shader is confined to the local current support, independent of seek/draw history. These are
stylized charge clusters, not an electromagnetic solver or automatic material understanding.

Generated charge cores inherit source velocity in its original direction, capped at 400 pixels/s
to contain supported fast dashes. Birth offsets use the actual source tangent. The plume core is
clipped at its source plane; independently shed particles do not have a universal source-plane
constraint. Existing source and ending event clocks/duration remain unchanged, so rapidly spent
energy can leave an empty part of the ending window. The old fixed terminal glow is not retained
for this new energy mode.

Native and adjacent-frame reviews distinguish compact, promptly exhausted energy from rising fire
and its longer residue even with matched palettes and light disabled. They do not establish an
unmistakable energy material: the plume can still read as a squat flame tuft and the dash as a busy
clump. Full-speed playback, user acceptance and a completed high-quality initial-generation goal
are unverified. The material introduction increased local CPU drawing cost. A subsequent exact-output raster
optimization skips impossible lobe noise and prepares invariant discharge geometry once per draw;
see checkpoints/charge-raster-performance-20261107.md for controlled CPU measurements and limits.
Neither change is Unreal/Niagara integration or a target-device performance guarantee.

## Compare explicit seeds before creating an effect

The existing `kind: "sequence"` generation source and `render --project` already render new
supported material/action effects **without a TypeScript module or catalog registration**.
See [SEQUENCES.md](SEQUENCES.md). The small `preview-generation` command automates only the
repeated setup of those projects for a few explicitly chosen seeds. It is not a new renderer,
seed search, aesthetic ranking, unrestricted text-to-effect system, or better artwork preset.

```sh
node build-tools/tools/preview-generation.mjs --material energy --action dash --distance 64 --travel .45 --seeds 0,17 --out records/pulse-previews
node tools/poku.mjs preview-generation --material ice --action shatter --seeds 0,17 --out records/ice-previews
# Optional existing GIF encoder; ffmpeg must be installed already:
node tools/poku.mjs preview-generation --material fire --action plume --seeds 0,17 --out records/fire-previews --gif
```

The output directory must not already exist, even if empty, and its parent must exist. Unknown,
repeated, missing or conflicting flags fail before output creation. Supply 1–4 distinct comma-separated
uint32 seeds explicitly; no random alternatives are chosen. Seed `0` is preserved. Only the existing
material/action/response aliases and dash distance/travel controls are accepted. There is no name,
category, free prose, loop, crop, fps, scale, palette, count or intensity override.

Each `seed-N/` contains:

- `project.json`: the exact resolved reusable project, with the seed owned by its single generation cue.
- `generation.json`: the canonical generation plan, including timing, bounds and event anchors.
- `sheet.png` / `sheet.json`: all sampled transparent native frames, exact fixed pivot and frame timing.
- `contact.png`: eight equally spaced temporal samples at 1×, composited over the existing contact-sheet backing.
- `anim.gif` only when requested: native-size, source-fps preview using the existing encoder. GIF palette and
  alpha are lossy, frame delay precision is limited, and playback repeats indefinitely even though the
  source is one-shot. Use the PNG and timing JSON as exact evidence.

`manifest.json`, written only on completion, binds those files by SHA-256, records the explicit order
of seeds and their common native dimensions, pivot, fps, frame count and sample indices, and records
coarse local setup/render/composite/copy/PNG-encoding/write timings. These are CPU tool wall times,
not GPU performance. Only one frame traversal per seed is used, but the existing sprite-sheet sink
retains a full atlas canvas. Current supported plans allocate at most 72 MiB for one atlas canvas,
plus PNG encoding scratch, rendered surfaces and runtime data. This is a structural allocation bound,
not measured peak process memory or a total memory cap. Work is serial and bounded to four candidates; no automatic seed ranking
or selection is saved. A late I/O or optional GIF failure returns nonzero and leaves owned incomplete
output without a success manifest. Nothing deletes or overwrites an existing output directory.

The artwork choice mirrors `new.mjs`: supported fire/energy dash or plume with dissipation explicitly
uses `material-volumes`; other supported compositions retain their existing choice. This does not change
saved effects or API defaults. Every seed keeps the source's native `meta.fps`, full declared canvas,
origin and duration. No crop or enlarged rendering is used. **Edge fade is explicitly disabled** in
these saved projects so a boundary defect is not softened away. Normal bare `render <id>` may apply
its existing 8-pixel light-edge fade; compare using `--edge-fade false` and the same fps/seed, or render
the saved project itself. `render --project` respects its stored `pixelStyle.edgeFade: 0`.

One-shot sampling uses the existing `round(duration * fps) + 1` contract. The last sample may round
slightly before or after the declared source ending, and atlas playback duration includes the last
frame's duration. The manifest names `sourceDuration`, `lastSampleTime` and `outputDuration` separately.
These facts are not silently corrected by cropping or resampling.

To adopt one candidate, use its saved project directly; no throwaway catalog effect needs deletion:

```sh
node build-tools/tools/render.mjs --project records/pulse-previews/seed-17/project.json --sheet --out records/chosen-pulse
# Separately create/fill the intent brief, including the actual duration and loop values.
node tools/effect-intent.mjs init preview/energy-dash-seed-17
node build-tools/tools/review.mjs --project records/pulse-previews/seed-17/project.json
```

This command creates no source, registry entry, intent brief or review record. After selecting a project,
create and fill its intent brief separately; review/share keep their existing intent and actual-viewing gates.
Preview output is not an approval,
review packet, material-physics certificate or claim that a particular seed matches a reference. Inspect
native pixels and full-speed motion before choosing. Saved projects/plans freeze input data, not a copy
of the engine implementation; keep the engine version/source alongside them for cross-version replay.

### Opt-in short-spark scintillation

For an explicit request for brighter, sparkling short fire sparks, select the finish at
initial generation rather than increasing particle count or changing the fire body:

```sh
node build-tools/tools/new.mjs fire/spark-study --material fire --action plume --fire-sparks short-exposure --fire-spark-finish scintillation
node build-tools/tools/preview-generation.mjs --material fire --action dash --response dissipate --seeds 17 --out /tmp/new-spark-preview --fire-sparks short-exposure --fire-spark-finish scintillation
```

Fire burst, fire plume, or fire dash with either response supports this choice. It is never
inferred from the effect name and is never enabled by default. Omitting the finish
preserves previous artwork, including already selected short-exposure sparks.
Source templates, preview manifests and saved generation projects retain the explicit
`fireSparkFinish: 'scintillation'` option. The public factory accepts
`createGeneratedEffect2D(plan, { fireSparks: 'short-exposure', fireSparkFinish: 'scintillation' })`;
the core API accepts `createSparkField2D({ ...options, finish: 'scintillation' })`.

The finish uses separate seeded short glints on unchanged births, trajectories,
counts, lifetimes and fire-body shapes. `--fire-spark-count 0` still removes sparks;
`--fire-spark-light 0` disables spark light while retaining colored glints. Core
`lightBudget: 0` emits no light. The light budget limits stable eligible spark IDs,
not glow calls: the finish may add a second glow call on up to 24 of those IDs.
`glintLit` in samples reports that eligibility, not current emitted light. Thus this
finish has additional draw cost and is not an equal-cost lighting mode.

This is an opt-in procedural finish, not a new creature/path generator, a web UI
control, Niagara certification, physical GPU performance evidence or aesthetic
approval. Inspect native-size/full-speed output separately before art acceptance.

### Short sparks on a generated fire burst

`preview-generation --material fire --action burst --seeds 17 --fire-sparks short-exposure --fire-spark-finish scintillation --out NEW_DIRECTORY`
selects the same existing short-spark core for a fire burst. The default is 170 births; count/light/finish controls work as above. The normal no-option burst, source shape, event clock and residue stay unchanged. A saved burst project exposes the same controls when imported into Studio; no new starter button is added.

This is an alternative particle renderer, not a shutter-only comparison: it uses the short-spark core's seeded channels, size-dependent gravity and back/front split, with fixed drag 1.6 and without the old burst particle curl. The existing source-surface emission callback and .08-second emission window are shared. Dash with a terminal burst is also supported, with the combined budget below. Native samples show more visible hot flecks, but do not establish improved fire-body shape, full-speed motion or user approval.

### Preserve translucent detail in an explicit GIF preview

`preview-generation --gif --gif-background '#15131d'` adds a solid backing **only to the
GIF** before its palette is generated. This preserves more of the transparent asset's
faint flames, glow and spark coverage than GIF's binary transparency, which otherwise
can discard alpha below 128 and make surviving partial coverage opaque. Choose any
explicit six-digit `#RRGGBB` color. The option requires `--gif`; omission keeps the
previous GIF behavior exactly.

The PNG atlas, contact sheet, saved project, generation plan, native dimensions,
sampling and original renderer buffers are unchanged. The manifest records the backing
color and composition policy. Composition is straight source-over in encoded RGB,
matching a transparent asset shown on that color. It is not a new HDR scene render,
new flame artwork, or an improvement to shape or motion. GIF palette and timing limits
still apply, and the backed GIF is opaque and cannot adapt to a different background.
Keep the transparent PNG/JSON for asset use.

### Short sparks across one dash and terminal burst

`--material fire --action dash --response burst --fire-sparks short-exposure` selects short sparks for BOTH flight and arrival, optionally with `--fire-spark-finish scintillation`. It keeps the existing body composition, timing and path; material-volumes remains unsupported for this response.

An omitted count uses the existing short profiles: 240 flight plus 170 arrival births (410 total), versus the legacy combined 180+170=350. This is a 17% birth-count increase and not an equal-count, equal-particle-motion or equal-energy comparison. Explicit `--fire-spark-count N` is always TOTAL births 0..720: flight=round(N*240/410), arrival=N-flight. Thus 0 disables both, 1 emits only in flight, 2 emits one in each phase. The shared ceiling of 24 light-eligible IDs is apportioned by those counts; default 14 flight + 10 arrival, not 24 each. Finish may add a second glow call on eligible IDs.

Flight births use the existing moving surface, inherited source velocity and seed XOR 771; arrival births use the existing destination burst surface, .08-second window and seed XOR 2009. Both capture positions at birth; arrival cannot start before the plan arrival. Sparks-hidden artwork, standalone profiles and omission remain unchanged. This extends authoring reach, not flame-body or normal-speed animation quality certification.
