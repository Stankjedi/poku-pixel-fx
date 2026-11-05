import type { PaintFrame } from '../core/painter.js';
import { composite } from '../core/fx.js';
import { WebGLCompositor, validateCompositeFrame, type CompositeBackground } from './webgl-compositor.js';

export interface FrameRendererStatus {
  backend: 'cpu' | 'webgl2';
  /** Why auto/webgl2 fell back; null when the requested path initialized successfully. */
  reason: string | null;
}
export interface FrameRendererOptions {
  /** CPU remains the default. auto/webgl2 try GPU compositing, with safe CPU fallback. */
  backend?: 'cpu' | 'auto' | 'webgl2';
  onStatus?: (status: Readonly<FrameRendererStatus>) => void;
}

/** Present a CPU-authored frame with optional WebGL2 color/light compositing.
 * An owned offscreen WebGL canvas leaves the host's 2D canvas usable after context failure.
 * GPU presentation uses drawImage, not a JS readPixels round-trip. */
export class FrameRenderer {
  readonly context: CanvasRenderingContext2D;
  private gpu: WebGLCompositor | null = null;
  private image: ImageData | null = null;
  private current: FrameRendererStatus = { backend: 'cpu', reason: null };
  private disposed = false;
  constructor(readonly canvas: HTMLCanvasElement, private options: FrameRendererOptions = {}) {
    if (!['cpu', 'auto', 'webgl2'].includes(options.backend ?? 'cpu')) throw new RangeError('Unknown frame renderer backend');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Presentation needs an available 2D canvas');
    this.context = ctx;
    if (options.backend && options.backend !== 'cpu') {
      try {
        this.gpu = new WebGLCompositor(canvas.ownerDocument.createElement('canvas'));
        this.current = { backend: 'webgl2', reason: null };
      } catch (error) { this.current.reason = error instanceof Error ? error.message : String(error); }
    }
    options.onStatus?.(this.status);
  }
  get status(): Readonly<FrameRendererStatus> { return Object.freeze({ ...this.current }); }
  /** Integer native-pixel camera offset; clipping/clearing match ordinary canvas presentation. */
  render(frame: PaintFrame, background: CompositeBackground = null, lightK = 1, offset: readonly [number, number] = [0, 0]): void {
    if (this.disposed) throw new Error('Frame renderer is disposed');
    validateCompositeFrame(frame, background, lightK);
    if (offset.length !== 2 || !offset.every(Number.isSafeInteger)) throw new RangeError('Camera offset must contain two integer pixel coordinates');
    if (this.canvas.width !== frame.w) this.canvas.width = frame.w;
    if (this.canvas.height !== frame.h) this.canvas.height = frame.h;
    const ctx = this.context, [sx, sy] = offset;
    if (this.gpu) {
      try {
        const rendered = this.gpu.render(frame, background, lightK);
        ctx.save();
        try {
          ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'copy';
          ctx.filter = 'none'; ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;
          ctx.imageSmoothingEnabled = false; ctx.clearRect(0, 0, frame.w, frame.h); ctx.drawImage(rendered, sx, sy);
        } finally { ctx.restore(); }
        return;
      } catch (error) {
        this.gpu.dispose(); this.gpu = null;
        this.current = { backend: 'cpu', reason: error instanceof Error ? error.message : String(error) };
        this.options.onStatus?.(this.status);
      }
    }
    if (!this.image || this.image.width !== frame.w || this.image.height !== frame.h) this.image = ctx.createImageData(frame.w, frame.h);
    composite(frame, this.image.data, background, lightK);
    if (sx || sy) {
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, frame.w, frame.h); ctx.restore();
    }
    ctx.putImageData(this.image, sx, sy);
  }
  dispose(): void { if (this.disposed) return; this.disposed = true; this.gpu?.dispose(); this.gpu = null; }
}
