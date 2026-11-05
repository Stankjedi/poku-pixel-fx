# Evidence before sharing

The `review` tool makes the inspection step concrete. It does **not** score beauty, certify
reference-level art, choose a style, add polish automatically, or demand a fixed number of iterations.
Choose an art direction, render once, inspect the evidence, fix the most consequential visible problem,
and repeat only when the result or its intended use warrants it.

## Workflow

First write the intended meaning, likely misread and causal motion in an intent brief, following
[EFFECT_INTENT.md](EFFECT_INTENT.md). `new` creates a blank brief; for existing effects:

```sh
node tools/effect-intent.mjs init fire/torch
# Fill authoring/fire/torch.intent.json, including the real duration and loop.
node tools/effect-intent.mjs validate fire/torch
npm run build
npm run review -- fire/torch
```

Open `records/review/fire/torch/playback.html` locally. The bundle contains:

- The intended scene at native 1× and exact nearest-neighbour 3× PNG dimensions.
- The actual export over dark, light and checker backgrounds at 3×. This reveals transparency and
  background-dependent legibility; it does not demand that every effect work on every background.
- A weighted grayscale view and color-buffer silhouette without additive glow. These are diagnostics,
  not contrast, accessibility or silhouette-quality pass/fail tests. Faint color alpha counts as occupied.
- First/last frames, time quartiles, the brightest sampled frame and its neighbours, plus up to four
  authored contact times. Brightest is a sampling cue, **not** an inferred impact or preferred composition.
- All-frame playback and scrubbing at the original fps, with native/3× scaling, scene/export backgrounds,
  repeat and pause. It starts paused. No video encoder, server or network is needed.

PNG sheets label the original frame number and time. Browser zoom and device pixel ratio can affect
physical display size; the encoded native and 3× pixels remain exact. Browser playback may skip display
frames on a slow device; scrub to inspect each frame and verify target-game playback separately.

Then copy `review-template.json` to a working JSON file and fill it **after viewing the images**:

- `reviewer`: the human or agent who actually inspected the evidence, identified truthfully.
- `reviewedAt`: the date and time of that inspection.
- `evidenceViewed`: explicitly `true` only after inspection.
- `intent`: the intended silhouette, focus, motion/style or useful reference. There is no mandatory motif.
- Four `observations`: native/enlarged clusters, silhouette/values, timing and background behavior.
  Say what was actually seen. For a still asset, explain why temporal behavior is not applicable.
- `knownLimitations`: unresolved weaknesses, untested contexts, or explicitly that none were noted.
- `decision`: `needs-work` to retain findings without clearing the sharing gate, or `ready` when the
  reviewer judges this particular asset suitable for its stated use. This remains their judgement.

Do not change the generated schema or hashes. Submit the completed file explicitly:

```sh
npm run review -- fire/torch --record /path/to/my-review.json
# Also complete the emitted intent-review-template-<hash>-<hash>.json after actual inspection.
node tools/effect-intent.mjs record fire/torch /path/to/my-intent-review.json
npm run share -- fire/torch
```

Preparing evidence never grants a review. There is no automatic approve flag. Empty notes, missing
explicit viewing confirmation, `needs-work`, changed evidence, and changed source/output/scene are
blocked by `share` before any upload-ready files are written. A SHA-256 identity binds the record to
the exported PNG, matching JSON (including timing/pivot), preview frames and effect source. A second
hash binds it to the diagnostic files. A valid visual record and matching intent brief/review are copied beside the share PNG/JSON.
The intent record separates intended meaning from observed first impression and records force,
causality and lifecycle findings with frame references. Human or agent review is allowed; a
reviewer self-assessment is not user approval. No extra user approval is required by this tool.

Rebuild after changing TypeScript, prepare new evidence and review the changed result. Unchanged
evidence can reuse its existing record; incidental reruns do not demand another approval. Rebuilding
the engine may change output even when the effect source did not, which invalidates that old review.

## Scope and compatibility

- Existing runtime APIs, effects, palettes, default pixels, `render`, GIF/MP4 and draft sprite-sheet
  exports remain unchanged. The existing `share <category>/<effect>` syntax remains; its intentional
  new precondition is a matching explicit review. It still does not publish or accept rights/terms.
- The review displays the **current export writer's** output, not a more flattering substitute.
  Export conversion and glow limitations remain visible; this tool does not silently repair them.
- This is a local 2D effect sharing workflow, not a security boundary or a universal runtime gate.
  Direct library use, other export routes, 3D, external raster imports and target games are not locked.
  Existing draft workflows remain available so artists can explore freely.
- Notes cannot prove that someone really looked or that their judgement was correct. The software
  verifies explicit evidence-linked accountability only, never unmeasurable artistic merit.
- The packet uses the default effect options/seed and current compiled build. It does not claim to
  inspect all seeds, recolors, poses, gameplay interactions or hardware. Review those when relevant.
- Size guard: up to 480×480, 120 fps, 4096 frames and 16M total native pixels. Sharing retains its own
  tighter site limits. The tool renders once per command and does not run the entire test suite.

## Focused checks

```sh
npm run build
npm run test:review
```

Three isolated tests cover exact scale pixels, unchanged frame buffers/export bytes, diagnostic view
semantics, all-frame playback evidence, explicit decisions and stale/tampered evidence rejection. They
use a tiny synthetic fixture. Their mock review records are **not** reviews of any real artwork.
