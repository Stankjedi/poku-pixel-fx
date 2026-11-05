# Native example observations

Reviewer: implementation agent, informed self-review. These observations concern
actual generated PNGs viewed on 2026-11-05. They do not record user approval and do
not certify all animations or poses.

## Files actually viewed

- `character-reference-native.png`: the two adult silhouettes read as a slim
  jacketed traveller and a broader worker in overalls. The four lower poses read
  as front, three-quarter, side and back. In the key-strike row, the contact hand
  reaches forward and the feet widen; the anticipation and recovery remain much
  closer to an ordinary guard. This is a useful authoring study, not a claim that
  every combat key is production-finished.
- `pixel-techniques-native.png`: the palette-cycle panel retains separate bands;
  the half-coverage panel has a fixed checker-like pattern. The metal study has a
  small, bright central highlight. Woven, stone and hatch examples have visibly
  different repeating/cluster patterns. Selective contour and authored-AA changes
  are subtle at 32 px and should also be inspected at integer zoom. The glass-ramp
  tile shows a highlight; it does not demonstrate refraction.
- `shared-identity-portraits.png`: body and portrait use the same teal clothing,
  copper-brown hair and warm skin palette. The three busts keep the same head and
  clothing mass. The mouth difference between neutral and smile is small at the
  native view; the determined brows/eyes are more distinct. The shared identity
  is a palette/trait contract rather than identical geometry at two resolutions.
- `equipment-native.png`: the sword handle remains at the leading palm in ready
  and contact images. The bow draw image shows a line from the upper/lower limbs
  toward the draw hand, and the release image shows an arrow separated forward
  from the bow. A first static thumbnail-based bow implementation did not carry
  the articulated string/hand relationship; it was replaced with the native
  held-equipment output from the existing weapon geometry before this image was
  generated and viewed.

The 24 px Lanternling is visibly much smaller than the 96 px people. Its lantern
shape and light-colored center survive the native view; very small face details
are not prominent. The serpent is a thin horizontal anatomy: its nominal 64 px
construction scale does not mean a 64 px tall silhouette.

## Playback status

`playback.html` and `idle-atlas.png` were generated at 30 fps for a two-second idle
loop. The implementation agent has **not viewed full-speed playback** in this
record. Timing, loop seams and motion readability remain for the integrated
browser review. Contact sheets do not substitute for that observation.

The generated `render-manifest.json` intentionally keeps its default viewing
flags false. Rendering never changes them automatically.
