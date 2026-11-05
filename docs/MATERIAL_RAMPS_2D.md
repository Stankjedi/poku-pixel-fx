# Authored material ramps for 2D pixel art

## What was learned, and what was missing

- [SLYNYRD, Pixelblog 1: Color Palettes](https://www.slynyrd.com/blog/2018/1/10/pixelblog-1-color-palettes): ramps can change hue and saturation as well as brightness; the increments need not be uniform, and visual judgment still matters.
- [Pedro Medeiros, Shading](https://www.patreon.com/saint11/posts/shading-13869731): hue shifts and band compression are useful ways to avoid muddy, uninteresting shadows.

The engine already has authored hue-shifted `PAL` colors, `fit()` for selecting ramp entries, and `at()` for equal-width color bands. Replacing those palettes or adding another preset list would duplicate existing work. What was missing was a small reusable way to choose **different light-to-color band widths per material**, with a separately reserved highlight.

`createMaterialRamp2D()` fills that gap. It is opt-in and leaves every existing effect unchanged. It does not automatically choose a good palette, infer normals, draw outlines, add texture, or perform physical light transport.

## API

```ts
import { createMaterialRamp2D } from "poku-pixel-fx/core/material-ramp";

const steel = createMaterialRamp2D(
  ["#111a2b", "#293d55", "#61798b", "#b6cad0"],
  {
    thresholds: [0.28, 0.66, 0.92],
    highlight: { color: "#fff0c4", threshold: 0.9 },
  },
);
const cloth = createMaterialRamp2D(
  ["#13333e", "#24545e", "#3f8384", "#a6beb0"],
  { thresholds: [0.10, 0.42, 0.84] },
);

// Supply responses from the material's own lighting model.
const metalColor = steel(diffuseResponse, specularResponse);
const clothColor = cloth(diffuseResponse);
```

Thresholds are strictly increasing inside 0..1, with one fewer than palette entries. A response equal to a threshold selects the next color. Responses below/above the nominal range choose the darkest/brightest entry. Without explicit thresholds the result matches `at()`'s equal-width selection.

The optional highlight is a separate authored color, selected only when its specular threshold is met and diffuse response is positive. It is not a glow. A matte material simply omits it. Palette colors are opaque `#rgb`, `#rrggbb`, or packed ABGR; callers retain responsibility for coverage when painting. The function returns only declared colors, never intermediate RGBs, dithering, noise or alpha changes. Configuration is snapshotted at compilation and can be reused across frames.

The existing point-light helpers can provide diffuse response. Specular response, if wanted, remains the caller's responsibility. The example uses a directional Lambert response and an authored Blinn-style term; this is a controllable study, not PBR or a global scene relighting feature.

## Controlled visual example

`src/examples/material-ramp-study.ts` draws an original axe with a steel blade, wood haft and cloth grip. Both modes use identical silhouettes, normals, light, material masks and base palettes. The **uniform** mode represents the existing equal-band building block; it is not a screenshot of an old catalog effect. The **authored** mode changes band widths and reserves one extra steel glint color. There is no glow, random grain, universal edge line, or per-pixel noise.

The example intentionally keeps wood and cloth matte. The blade's thin connected reflection changes position with the key light, while broader value groups describe the handle and grip. This made material separation more legible in this particular preview. The same thresholds are not automatically suitable for other artwork.

### Three render/inspect passes

1. The first steel highlight formed a broad rounded spot. It read closer to glazed ceramic than the intended blade. The normal field was reauthored as cross-blade curvature so the reflection follows a continuous strip.
2. The next strip still occupied too much of the blade. Its highlight threshold was raised, preserving the body values and reducing the bright area.
3. The final output was inspected at native 1x and enlarged integer scale, then under left and right keys. The light-dependent strip stays on steel; cloth and wood retain their own matte bands. The result is a deliberately simple prop, not a claim of reference-level character or environment art.

These observations are visual judgments. The tests below check safety, palette membership and the controlled comparison, not artistic quality.

## Reproduce

```sh
npm ci
npm run build
node --test tests/material-ramp.test.mjs
node tools/preview-material-ramps.mjs
```

Outputs under `records/material-ramp-study/`:

- `before-after.png`: uniform versus authored bands, with native-size views and palette swatches.
- `authored-native.png`: the transparent 128×108 sprite.
- `light-direction-review.png`: left/right key comparison.
- `moving-key-comparison.gif`: the same prop under a moving key.
- `validation.json`: identical coverage/material masks, no glow, and changed color cells. Those counts do not certify aesthetics.

The reference pages informed general practice only. No reference sprite, tutorial image, palette asset or paid content is redistributed.
