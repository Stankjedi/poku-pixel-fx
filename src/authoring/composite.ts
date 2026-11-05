import { composite } from '../core/fx.js';
import { CinematicCompositor, type CinematicFrame, type CinematicOptions } from '../render/cinematic.js';
import { finishProjectRGBA } from './edits.js';
import type { ResolvedProject } from './project.js';
const compositors = new WeakMap<object, CinematicCompositor>();
export function projectCinematicOptions(project: ResolvedProject, background: Uint32Array | number | null = null): CinematicOptions {
  const profile = project.renderProfile ?? {};
  const {mode: _mode, ...settings} = profile.cinematic ?? profile;
  return { bloom: {threshold:.12,knee:.2,intensity:.7,levels:3}, toneMap:'aces', exposure:1, ...settings, background,
    ...(project.pixelStyle?.finalColorPolicy==='palette-locked'?{finalPalette:project.pixelStyle.palette}: {}) };
}
/** Same finish for authoring, CLI and worker. A scene backing and a transparent asset are explicit choices. */
export function compositeProjectFrame(frame: CinematicFrame, rgba: Uint8ClampedArray, project: ResolvedProject, background: Uint32Array | null = null): void {
  if (project.renderProfile?.mode === 'cinematic' || project.kind === '3d') {
    let compositor = compositors.get(project);
    if (!compositor) {compositor = new CinematicCompositor();compositors.set(project,compositor);}
    compositor.render(frame,rgba,projectCinematicOptions(project,background));
  } else composite(frame as any, rgba, background);
  finishProjectRGBA(rgba,project);
}
