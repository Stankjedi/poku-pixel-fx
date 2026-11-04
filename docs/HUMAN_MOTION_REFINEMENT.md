# Human motion and sword refinement

This pass changes held-sword motion, sword rasterization, and punch/block/hit choreography. It does not replace face/head artwork or claim the full human art direction is finished.

## Changes

- The sword now rises through an overhead preparation, transfers weight from the rear hip, accelerates into a cut, holds the contact pose for 30 ms, follows through, then gathers near the body before returning to guard.
- Preparation and extension keep the same elbow branch. The wrist no longer winds around the shoulder through a 4.58-radian bend.
- The body moves between fixed planted feet, so knee flex and torso movement follow the weight shift. The off hand changes with the action instead of staying frozen.
- The blade is a constant-length, tapered arming-sword shape. A compact crossguard, grip, and pommel remain attached to the actual palm. The forearm and blade are aligned at contact.
- Steel is rasterized once in blade-local coordinates with three solid material colors. This avoids pinholes from independently rounded polygons/edge lines. The default blade has no thick black contour. An explicitly requested custom outline still works.
- Punching drives the hip before full extension, holds contact, and retracts the fist before the hips settle. A block yields slightly after its cue; a hit shifts weight backward rather than only bending the upper body.
- No per-part black interior outlines, dither, detached sparkles, or bitmap resizing were added. Bow behavior is unchanged.

## Timing compatibility

Sword duration remains 1.2 seconds and its cue remains 0.44 seconds. `HUMAN_WEAPON_TIMING.sword.follow` is now 0.56 seconds, matching the new completed follow-through. The phase transitions remain continuous. Combat cue times are unchanged. Cues are authoring synchronization markers, not collision or damage events.

## Native comparison

Run `node tools/preview-human-motion-refinement.mjs OUT BASELINE_MODULE` after building both revisions. The baseline module must export `renderHumanWeapon2D`, `humanCombat2D`, and `renderHuman2D` (a built `core/index.js` works).

The supplied GIFs show before on the left and after on the right. Both 64x64 and 128x128 shared-grid panels use a 36px actor. The larger panel adds exactly 32px padding on each side; it does not scale the actor or its pixel grid. The separate target-128 study renders a 72px actor directly at native resolution. All GIFs are 50fps, 90 frames, and 1.8 seconds, with no bitmap interpolation.

## Verification

- Build and focused regressions.
- Existing human/weapon/combat suites, including reachable joints, fixed bone lengths, palm/hilt occlusion, mirror equality, exact cue placement, and transparent padding.
- New regressions for supported hip transfer, contact hold, a separate recovery path, blade/forearm alignment, no default blade halo, and identical shared scene pixels.
- Blade finishing audit: 4 views x 7 actor heights x 61 frames = 1,708 samples. The exposed blade is four-connected and has no transparent one-pixel pinholes. The tiny heel can be separated from the steel by the gold guard; that is a material junction, not a detached pixel.
- Full quality, 3D, and export regression results are recorded in `checks/`. Passing them is not a claim of artistic completion.

## Visual assessment and limits

The overhead preparation and forward cut are clearer than the previous shoulder-level wrist sweep. The blade now reads as a narrow solid steel object instead of a cyan outlined bar. The 36px actor still has very little face or hand detail, and the 2D broad views do not rotate the torso into a different camera view. The action is deliberately a readable one-handed game-animation study, not a fencing simulation. There is no slash smear; weight and timing remain visible without an effect hiding the anatomy. Further hand-authored posing could still add character.

## Primary artist references

- [Raymond Schlitter / SLYNYRD, Pixelblog 9: Melee Attacks](https://www.slynyrd.com/blog/2018/9/8/pixelblog-9-melee-attacks): appropriate stance, brief fast swing, held follow-through, and recovery overshoot. The public sword and punch tutorial GIFs were inspected.
- [Pedro Medeiros / Saint11, Pixel Art Tutorials](https://saint11.art/blog/pixel-art-tutorials/): attack timing and a recovery that differs from the strike. The public AttackSheet tutorial was inspected.

These informed the motion principles. No artist sprite, tutorial image, or palette was copied into the deliverable.
