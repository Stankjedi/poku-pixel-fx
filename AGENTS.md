# Agent workflow

For effect creation and public sharing, read `skills/poku-pixel-fx/SKILL.md`. Work from a local checkout: run `npm ci` if dependencies are missing, then `npm run build` and `npm run share -- <category>/<effect>`. The command creates an upload-ready PNG and matching JSON and prints their paths. On the sharing site, select the PNG and JSON together, complete the required user rights declaration, and verify the published entry. Do not bypass login, invent identity headers, or declare rights on the user’s behalf.

Preserve LICENSE and NOTICE and relevant third-party notices when redistributing. Do not describe the future native runtime as implemented.

For 3D pixel VFX work, see `docs/3D_VFX.md`. Keep the new `src/3d/` engine independent from `src/core/` and the 2D effect catalog. Preserve seeded, fixed-step simulations, render/inspect/refine, explicit pixel palette and light buffers; build and run `npm run test:3d` before merging.
