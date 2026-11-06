// poku-pixel-fx core: everything an effect imports comes from here.

export * from "./math.js";
export * from "./color.js";
export * from "./particles.js";
export * from "./flow.js";
export * from "./air.js";
export * from "./liquid.js";
export * from "./smoke.js";
export * from "./stone.js";
export * from "./glass.js";
export * from "./frost.js";
export * from "./corrosion.js";
export * from "./sigil.js";
export * from "./propulsion.js";
export * from "./ground-impact.js";
export * from "./impact-contact.js";
export * from "./shapes.js";
export * from "./quality.js";
export { Particles, Bits, Lights, Blazes, P, PF, B, GRAVITY, FIRE_RAMP, SMOKE_RAMP, sparkle, flare, band, crystal } from "./sim.js";
export { Painter } from "./painter.js";
export type { PathOptions } from "./painter.js";
export type { AlphaMode } from "../render/coverage.js";
export { FONTS, textWidth } from "./font.js";
export { createFrame, clearFrame, createFx, composite, painterFor, resolveOptions, sceneCameraOffset, FX_TICK_RATE, FX_TICK_SECONDS } from "./fx.js";
export { stockActor, drawActor, actorAlphaOf, withActorPixels, HERO, HERO2, HERO_PAL, DUMMY_PAL } from "./actor.js";
export { backdrop, BACKDROPS } from "./scene.js";
export { createAct, actBounds, actSpan, actTiming, poseAt, lerpPose, Target, STAND, SKINS, posed } from "./act.js";
export type { ActHit, ActTimingHit } from "./act.js";
export { skeleton, posedParts } from "./rig.js";
export { READY } from "./poses.js";
export { chain, shiftKeys, shiftHits } from "./chain.js";
export type { ChainCue, ChainPainter, CuePosition } from "./chain.js";
export type { EffectDrawContext } from "./fx.js";
export { CinematicCompositor } from "../render/cinematic.js";
export type { CinematicFrame, CinematicOptions, BloomOptions } from "../render/cinematic.js";
export { enableHDRLight, importPackedLight } from "../render/hdr.js";
export type { HDRLightFrame } from "../render/hdr.js";

export * from "./restoration.js";

export * from "./human.js";

export * from "./human-action.js";

export * from "./human-combat.js";

export * from "./creature.js";

export * from "./human-weapon.js";

export * from './human-portrait.js';

// Reimplemented opt-in 2.5D material response; existing renderers are unchanged.
export { samplePointLight2D, localPointLight2D, createPointLightSampler2D } from './point-light-2d.js';
export type { PointLight2D, PointLightSample2D, LightVector2D } from './point-light-2d.js';

export * from './canvas-bounds.js';

export * from "./detail-particles.js";

export * from "./sprite-edit.js";

export * from "./timing-curve.js";

export * from "./material-ramp.js";

export type { PixelActor2D } from "./actor.js";

export * from "./sprite-clip.js";

export * from './actor-adapter.js';
export { resolveEffectExport, exportLayout2D, frameDurationMs, edgeFade, separateFrameLayers, atlasMetadata } from '../render/export.js';
export type { ActorSelection2D, ActorAdapter2D, ActorSample2D } from './actor-adapter.js';

export { effectExampleCode2D } from './example-code.js';

export { WebGLCompositor } from "../render/webgl-compositor.js";
export type { CompositeBackground, WebGLCanvas } from "../render/webgl-compositor.js";
export { FrameRenderer } from "../render/frame-renderer.js";
export type { FrameRendererOptions, FrameRendererStatus } from "../render/frame-renderer.js";

export * from './sprite-raster.js';
export * from './pixel-tools.js';
export * from './pixel-style.js';
export * from './pixel-quantize.js';
export * from './material-surface.js';
export * from './pixel-contour.js';
export * from './pixel-material.js';
export * from './pixel-art-analysis.js';
export * from './pixel-brush.js';
export * from './pixel-palette.js';
export * from './pixel-surface-maps.js';
export * from './character-animation.js';
export * from './character-identity.js';
export * from './creature-asset.js';
export * from './character-asset.js';
