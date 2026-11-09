# New-generation detached particle volumes

## Scope and evidence

Baseline: f712effee0b29868388936c99cce8af4c2949f00. Existing catalog and stored artwork are
unchanged. New CLI fire/energy dash/plume+dissipate modules explicitly select finite shed material.
The reusable primitive renders independent current-position volumes; a shared curl field moves
those particles. Existing primary/ignition/ending forms, events and source momentum are preserved.
Ice, bursts and other template routes are unchanged.

Actual CLI generation produced fire plume, energy dash and fire dash modules. Native 384×256
frames were inspected at 0.15, 0.35, 0.55, 0.9, 1.3 and 1.8 seconds, plus adjacent frames, for
seed 218, the default seed 1 and independent seed 17. Matched-palette/unlit comparisons remove
color and bloom as explanations. Full timelines were exported at authored 40 fps. The GIF shows
all three pairs at native pixels, previous on the left and candidate on the right, without crops.

The first body-free candidate reduced lines but lost early dash direction and the plume's rooted
shape. It was rejected. The final narrower revision visibly changes thin parallel shed strands
into broader disconnected pieces while retaining direction and recognizable flame form. Plume
births are inside the source so finite lobes do not bulge below it. An independent static review
accepted this bounded change and found no new serious regression in inspected native/adjacent
frames. This is not a claim of full-speed playback, user approval, arbitrary material understanding,
fluid simulation, GPU performance or Unreal/Niagara equivalence. Fire/energy still have similar
comet-like dash composition; the broader initial-quality goal remains open.

## Technical verification

- Build passed; generation suite 96/96, phoenix 7/7, quality suite 419/419.
- Clean offline package installation and installed volume API smoke test passed 1/1. The first
  packaging attempt could not create the default npm cache; rerunning with a writable temporary
  cache passed. No dependency or environment permission change was needed.
- Final focused generation/volume tests passed 9/9.
- Independent code review: 126 default rendering hashes exactly match baseline; 16 supported
  material/action/uint32-boundary seed cases pass seeking, reinstance identity, light/layer flags,
  native bounds and empty endings. Eight extreme dash distance/travel combinations pass bounds.
- A high-bit seed derivation bug found in the rejected candidate was fixed by unsigned seed
  normalization. The finite volume primitive also rejects unbounded ages before shader execution.
- All 322 tracked effect, 3D-effect and authoring files match baseline exactly. Combined path/content
  SHA-256: 415cd7d650e2dacc09135273ee12b4c767f7e8eaa1ec5175ef0a603e6d325576.

A container CPU probe (seven sequential preparations, first excluded from warm median) measured
preparation at about 37 ms for fire plume, 30 ms for energy dash and 26 ms for fire dash. Previous
values in the same probe were about 1.5/20/20 ms respectively. Mean native drawing was about
4.7/3.0/2.3 ms versus 5.6/2.0/1.6 ms. These are rough local CPU observations, not stable benchmarks,
FPS claims or target-hardware guarantees. Shared flow has a real setup cost; sparse sparks remain
on their cheaper ballistic path.

## Reproduction and preservation

The v1 generation plan describes semantics/timing; the generated TypeScript module also records
`composition: 'volumes'`. Keep that option with saved plan-based reproductions. One-argument calls
and explicit `composition: 'body'` retain their prior output. See GENERATION_QUALITY.md for API
bounds, routing and limitations. The source checkpoint is local/private and is not a public release.
