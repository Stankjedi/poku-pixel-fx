# Optional WebGL2 compositing

POKU can use WebGL2 for the **final legacy color/light/background composite and presentation**. Effect updates, particle simulation, `Painter` drawing, authored pixel cells and source buffers remain on the CPU. This is not GPU particle simulation, a GPU rasterizer, WebGPU compute, or a replacement for the cinematic/HDR/bloom compositor.

WebGL2 was chosen for an incremental browser path using the existing buffers. Existing APIs, CPU defaults, effect behavior, PNG/JSON export and Aseprite workflows remain unchanged. This implementation does not claim a measured speedup; small canvases can be faster on the CPU once uploads and presentation are included.

## Try it

Run `npm run build` and `npm run gallery`. Open an effect's detail view and choose **GPU 합성 시도**. The status shows **WebGL2 합성** when the shader path is active, or **CPU 대체** with the reason when it cannot run. Tiles and file exports remain CPU-based. Closing the detail view or turning the request off releases the owned WebGL context. Toggling back on retries without restarting effect playback.

WebGL2 can itself use a software driver. The status describes the graphics API path, not proof of hardware acceleration. Device availability and speed must be measured on the target browser/device.

## Host API

```ts
import { createFrame, clearFrame, createFx, FrameRenderer } from 'poku-pixel-fx';
import * as torch from 'poku-pixel-fx/fx/fire/torch';

const canvas = document.querySelector('canvas')!;
const frame = createFrame(96, 96);
const effect = createFx(torch, { x: 48, y: 72 });
const renderer = new FrameRenderer(canvas, {
  backend: 'auto', // 'cpu' is the default; 'auto'/'webgl2' try GPU then safely fall back.
  onStatus: status => console.log(status.backend, status.reason),
});

function tick(dt: number) {
  effect.update(dt);
  effect.draw(clearFrame(frame));
  renderer.render(frame, 0xff181820); // null for transparent; also accepts a Uint32 background.
}
// Call tick from the host's existing loop. Call renderer.dispose() when finished.
```

`FrameRenderer` owns presentation on the supplied 2D canvas. Do not apply external clipping to that context. It creates a separate, owned WebGL canvas because a canvas initialized as WebGL cannot subsequently become a 2D fallback surface. The native-size GPU image is copied with `drawImage`, with smoothing, filters, extra alpha and blending disabled. No `readPixels` call occurs in normal presentation. Browsers decide how that inter-canvas transfer is implemented; it is not guaranteed to be zero-copy.

`render(frame, background, lightK, [sx, sy])` accepts integer native-pixel camera offsets. Invalid frame dimensions/buffers/offsets are rejected before rendering, rather than concealed as a GPU failure. Context loss or graphics errors switch the current and subsequent frames to CPU. Construct a new renderer to retry GPU. A lost context does not restart the effect or simulation.

For an exclusively owned WebGL or OffscreenCanvas, use `new WebGLCompositor(canvas)` directly and call `render`. This lower-level class throws when unavailable; it does not provide a fallback. `readPixels()` is a diagnostic/export operation that reads native top-down RGBA and can stall the pipeline. `dispose()` is idempotent.

## Pixel, alpha and light contract

- Color and legacy 8-bit light are uploaded as unsigned integer textures, not interpolated colors. Texel fetches operate at native resolution. Texture filtering is nearest and MSAA/dithering/blending are disabled.
- The fragment shader mirrors `composite()`'s encoded-RGB arithmetic, alpha behavior, flat/buffer backgrounds and additive-light conversion over transparency. Canvas context uses `premultipliedAlpha: false`; the host presentation does not multiply alpha a second time.
- The shader quantizes bytes with nearest-even rounding. GPU float32 and CPU double arithmetic may differ by one byte. The browser check explicitly tests this tolerance rather than claiming bit-exact GPU color arithmetic. Pixel locations are not filtered or moved.
- Use integer CSS enlargement and `image-rendering: pixelated` when displaying pixels enlarged. Browser zoom/DPR and CSS shrinking still affect physical display; the API does not force a host layout. The gallery retains its existing small-preview behavior.
- `hdrLight`, linear-light bloom and cinematic options are outside this API. Like legacy `composite()`, it uses the frame's 8-bit `light` mirror only. Continue using `CinematicCompositor` for cinematic/HDR output; no silent cinematic replacement occurs.
- Frames are limited to 16,777,216 cells and the device's texture limit. Excessive GPU-only limits fall back in `FrameRenderer`; the standalone compositor throws.

## Validation and current environment limits

`npm run test:gpu` checks CPU parity/fallback, source-buffer immutability, resize, camera offsets, invalid inputs and lifecycle/context-loss behavior using an explicitly labelled WebGL call mock. A mock is not shader execution.

After serving the repo, open `/tests/webgl-browser.html` for real-browser checks. It compiles and executes the actual shaders, compares CPU/GPU bytes over alpha edge cases, light-only and partial-alpha cells, several backgrounds/strengths and odd canvas sizes, checks orientation/source immutability, displays a nearest-enlarged comparison, compares actual offscreen-WebGL-to-2D presentation (including transparency), and forces the presenter’s context-loss fallback when supported. Presentation comparisons account for browser premultiplication quantization, with a maximum two-byte premultiplied-color tolerance and one-byte alpha tolerance. It reports `unavailable` rather than success if no context exists. No hardware benchmark is included.

In the implementation environment, Chromium 156 exited before loading the test page because process socket creation was prohibited (`socket() failed: Operation not permitted`). A normal execution retry in the approved scope produced the same restriction. Browser sandbox/security settings were not disabled. Therefore browser shader execution, canvas presentation, real context-loss recovery and hardware acceleration are **not yet verified here**. Run the real-browser check on the target device before relying on GPU output in production.

The exact GLSL sources were additionally compiled and executed through a standard surfaceless EGL context using **Mesa llvmpipe**, a CPU software OpenGL ES 3.2 driver. Sixty cases covered synthetic alpha/light/background combinations plus native Torch and Rising Smoke frames. Across 1,604,592 compared bytes, 1,072 differed and the maximum error was one byte. The inspected Torch comparison was byte-identical. This verifies shader execution/math on that software driver, not browser WebGL validation, the inter-canvas presentation path, physical GPU acceleration, or performance. The real-browser test remains required.
