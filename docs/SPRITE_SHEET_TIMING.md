# Sprite-sheet timing

The standard PNG/JSON exporter writes integer milliseconds, as expected by Aseprite-style animation importers. It rounds cumulative frame boundaries and subtracts consecutive boundaries:

```text
duration[i] = round((i + 1) * 1000 / fps) - round(i * 1000 / fps)
```

Rounding every frame independently made a 60-frame, 60 fps loop last 1020 ms and a 30-frame, 30 fps loop last 990 ms. The error accumulated on repeated playback. Both now last 1000 ms. Individual frame durations alternate when necessary, such as 17/16/17 ms at 60 fps. Each cumulative boundary stays within half a millisecond of the intended time.

The Aseprite project bridge uses the same exported durations instead of maintaining a second correction. Its timing output is unchanged.

## Compatibility and limits

- PNG pixels, atlas layout, frame order/count, pivot, frame tags and `meta.pokuFx.fps` are unchanged. Runtime rendering and effect sources are untouched.
- Rates with exact integer-millisecond intervals, such as 25 and 50 fps, have identical JSON durations. Other rates intentionally receive corrected duration fields.
- Non-looping renders retain their existing endpoint frame. Total exported duration is based on the actual frame count, not shortened to the effect's nominal duration.
- Existing exports are not rewritten. A visual review bound to an older JSON hash must be prepared and explicitly reviewed again before sharing the changed asset.
- Millisecond timing is still quantized. This does not add variable-duration sampling or guarantee timing in a third-party engine that ignores per-frame durations. The Aseprite bridge still accepts 1–240 fps; this fix does not extend rate limits or add validation to the shared export helper. Rates above 1000 fps cannot represent every frame as a positive integer millisecond.

## Focused verification

`npm run test:export` includes cumulative-boundary checks at integer and fractional rates, standard PNG/JSON runtime reimport, exact pixel preservation, and loop wrap timing. The Aseprite bridge's existing real-effect round-trip test checks parity with the same shared exporter. These are functional timing checks, not an assessment of artistic quality.
