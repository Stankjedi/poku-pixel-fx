# Safe 2D animation canvas bounds

These opt-in helpers measure and copy 2D animation canvases without changing rendering defaults.

```ts
import { animationBounds2D, cropFrame2D } from "poku-pixel-fx/core/canvas-bounds";

const bounds = animationBounds2D(frames, { padding: 2 });
const cropped = bounds ? frames.map(frame => cropFrame2D(frame, bounds)) : frames;
// If the authored world pivot is [0, 0], its new array coordinates are [-bounds.x, -bounds.y].
```

- `frameBounds2D(frame, options)` measures one frame. `animationBounds2D(frames, options)` produces a shared rectangle, avoiding per-frame pivot movement. Empty frames are ignored; an empty result is `null`.
- Bounds `{ x, y, w, h }` use **integer world coordinates**, including each source frame's `ox/oy`. Different source sizes and origins are supported.
- Default measurements include every color alpha byte above zero, nonzero packed RGB light, and positive HDR light. Thus faint color or a glow-only pixel will not be silently trimmed. `includeLight: false` or `alphaThreshold: 1..255` deliberately relax that protection.
- `padding` adds the same non-negative integer margin on all sides. It is not accumulated once per animation frame.
- `cropFrame2D(frame, bounds)` copies the selected rectangle without resampling. Rectangles outside the original frame add transparent space. It preserves world placement, all color/light values, optional Float32 HDR RGB triples, and frame settings.
- Pixel buffers are independent copies. Non-buffer frame settings are retained by reference. This is a 2D `PaintFrame` utility, not a 3D depth-buffer crop.
- Invalid/fractional coordinates and mismatched buffers reject. A crop exceeding 16,777,216 output pixels rejects before allocating. All source frames remain unchanged.

Focused check:

```sh
npm run build
node --test tests/canvas-bounds.test.mjs
```

Tests cover alpha/glow bounds, empty frames, shared animation pivots, HDR copying, crop/pad round trips, input limits, and cropping an existing crystal animation without losing visible cells or emission.
