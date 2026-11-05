# Safe looping particle emission

`cycle(time, period, count, seed, life, draw)` previously entered an endless loop for a negative
period or an infinite lifetime. A malformed dynamic effect option could therefore hang the gallery
or sprite exporter rather than report the input error. Tiny positive periods with long lifetimes
could also request an impractical number of overlapping generations.

The helper now fails with `RangeError` before unbounded work:

- `period` must be finite and positive.
- `time`, `seed`, `count`, and numeric or callback-generated lifetimes must be finite.
- Count must be between 0 and 65536. Its former fractional round-up behavior is preserved.
- Non-positive lifetimes still emit nothing.
- One call may visit up to 65536 source particles and emit up to 65536 live copies in total.
  Exceeding the limit throws; particles are never silently dropped to meet the budget.

No valid animation math was replaced. Age accumulation, wrapped phases, callback order, random
streams, and overlapping-generation drawing retain their original behavior within the budget.
No catalog shapes, colors, presets, default density, or other particle systems are changed.

If a later particle's lifetime callback returns an invalid result or exceeds the remaining budget,
earlier particles may already have drawn. Treat an error as a failed frame and discard it. The guard
cannot stop user callbacks that themselves never return, and it does not replace input validation
in unrelated helpers such as `burst` or `stream`.

Build and run `node --test tests/particle-cycle-guard.test.mjs tests/particle-quality.test.mjs`.
The focused tests compare exact callback output to the former implementation on valid cases and
cover the previously non-terminating inputs, overlap budget, fractional counts, looping phases,
zero lifetimes, and numeric overflow.
