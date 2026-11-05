# Agent workflow

For effect creation and public sharing, read `skills/poku-pixel-fx/SKILL.md`. Work from a local checkout: run `npm ci` if dependencies are missing, then `npm run build` and `npm run share -- <category>/<effect>`. The command creates an upload-ready PNG and matching JSON and prints their paths. On the sharing site, select the PNG and JSON together, complete the required user rights declaration, and verify the published entry. Do not bypass login, invent identity headers, or declare rights on the user’s behalf.

For every new or substantially revised effect, read `docs/EFFECT_INTENT.md`. Write the intended meaning, likely misread, silhouette, force/source/direction/material, causal chain and ending in `authoring/<category>/<effect>.intent.json` before detail work. Use `node tools/effect-intent.mjs init <id>` for existing effects. Inspect actual native-size evidence and full-speed playback, record observed first impression separately from intended meaning, then fix the largest misread. An agent or human who actually viewed the result may record their own judgement; this is not user approval. Never auto-fill viewing confirmations, certify aesthetics/physics from tests, or demand user approval unless the action requires it. `new/review/share` integrate these records; draft rendering remains available.

Preserve LICENSE and NOTICE and relevant third-party notices when redistributing. Do not describe the future native runtime as implemented.

For 3D pixel VFX work, see `docs/3D_VFX.md`. Keep the new `src/3d/` engine independent from `src/core/` and the 2D effect catalog. Preserve seeded, fixed-step simulations, render/inspect/refine, explicit pixel palette and light buffers; build and run `npm run test:3d` before merging.
