# Exact-output charge raster performance

Baseline: 3b151ea1adb0df4155c22e19e5fd29adcd808c40. This is a CPU optimization of
createChargeVolume2D only, not new artwork or a visual-quality improvement.

## Profile and change

A Node CPU sampling profile of ten full energy dash and ten plume timelines, seed 218,
at native 384×256 attributed about 36% of self samples to the charge pixel shader,
30% to noise2, 11% to hash and 6.5% to garbage collection. These are sampled attribution,
not exact operation timings. The shader calculated noise outside possible lobe coverage
and recreated the same two-segment geometry for every visited pixel.

The optimized shader prepares discharge endpoints, deltas and denominators once per draw.
It evaluates lobe noise only when the unchanged analytic distance is below 1.17. Value noise
is bounded by [-1,1], so the original boundary 1 + .16 * noise cannot reach 1.17, including
a conservative rounding margin. Skipped noise cannot affect coverage or color. Segment
arithmetic, segment/lobe order, pixel bounds, palette, alpha and compositing remain unchanged.
There is no approximate cache, quantization, frame skipping, particle reduction, new persistent
storage or altered source motion. Resolved sample state and deferred/reentrant shade callbacks
retain their behavior. Per-draw segment storage is bounded by three lobes and two segments each.

## Same-environment comparison

Baseline and candidate bundles were measured in the same Node process. Each received two
warmup timelines, then six alternating AB/BA full native timelines per case. Values below are
the median of six mean per-draw CPU times, excluding buffer clearing, compositing, export and
emitter preparation. No other intentional CPU benchmark/test was running at measurement time.

| Case | Seed | Before ms | After ms | Ratio |
| --- | ---: | ---: | ---: | ---: |
| Energy dash | 1 | 5.869 | 2.270 | 2.59× |
| Energy dash | 17 | 6.525 | 3.096 | 2.11× |
| Energy dash | 218 | 8.117 | 2.527 | 3.21× |
| Energy plume | 1 | 5.912 | 1.908 | 3.10× |
| Energy plume | 17 | 6.401 | 2.106 | 3.04× |
| Energy plume | 218 | 6.030 | 2.077 | 2.90× |
| Unchanged fire dash | 218 | 1.993 | 1.903 | 1.05× |
| Unchanged fire plume | 218 | 3.933 | 3.763 | 1.05× |

Every measured energy AB/BA pair improved; individual pair ratios varied from 1.40× to 5.05×.
Unchanged fire controls varied both directions, with pair ratios 0.93–1.16×. JIT, GC and shared
host noise remain limitations. Earlier single-pass 3.4→9.5 ms figures are not directly comparable
to this controlled run. This is not a target-device, GPU, FPS, setup-cost or memory-usage guarantee.

## Exactness and regressions

A frozen pre-optimization renderer in tests/fixtures is the reference for persistent tests.
Those compare full resolved states, raw shader output/bounds, finite extremes, both buffers in
overlapping/reordered batches, and retained/nested shade callbacks. Existing material tests remain.

Independent review found zero differences in:
- 2,192 resolved sample states and 635,976 direct shader samples, including support boundaries,
  subnormal sizes, extreme finite positions/angles, uint32 seeds and ±3600-second times.
- 576 overlapping color, light and HDR buffer comparisons in coverage and dither modes.
- Eight deferred/reentrant mutable-painter traces.
- 1,416 full generated recipe frames, including energy dash/plume, four seeds, all four supported
  distance/travel corners and default dash, 11 layer configurations, palette/layer snapshot mutation,
  and reverse/skip/repeated time orders. Color, light and HDR buffers matched exactly.

Build, focused tests 8/8, generation 104/104, phoenix 7/7 and offline installed-package smoke 1/1
passed. Existing catalog assets, generator options, plans, event timing and visual limitations are
unchanged. A separate private source backup preserves this checkpoint; no public release is implied.
No new GIF is necessary because the verified visual output is unchanged.
