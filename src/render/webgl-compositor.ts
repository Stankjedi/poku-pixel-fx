import type { PaintFrame } from '../core/painter.js';

export type CompositeBackground = number | Uint32Array | null;
export type WebGLCanvas = HTMLCanvasElement | OffscreenCanvas;

/** Validation is shared with the optional presenter, never inserted into the existing CPU API. */
export function validateCompositeFrame(frame: PaintFrame, background: CompositeBackground, lightK: number): void {
  const n = frame.w * frame.h;
  if (!Number.isSafeInteger(frame.w) || !Number.isSafeInteger(frame.h) || frame.w < 1 || frame.h < 1
    || n > 16_777_216 || !(frame.color instanceof Uint32Array) || !(frame.light instanceof Uint32Array)
    || frame.color.length !== n || frame.light.length !== n)
    throw new RangeError('Frame needs positive integer dimensions and matching Uint32 color/light buffers (at most 16,777,216 cells)');
  if (background !== null && typeof background !== 'number' && (!(background instanceof Uint32Array) || background.length !== n))
    throw new RangeError('Background must be a packed color, null, or a matching Uint32 buffer');
  if (typeof background === 'number' && (!Number.isInteger(background) || background < -2147483648 || background > 0xffffffff))
    throw new RangeError('Background color must be a packed 32-bit integer');
  if (!Number.isFinite(lightK) || lightK < 0) throw new RangeError('Light strength must be finite and non-negative');
}

const VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;
const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
uniform usampler2D u_color;
uniform usampler2D u_light;
uniform usampler2D u_background;
uniform uint u_flat;
uniform int u_backgroundMode;
uniform int u_height;
uniform float u_lightK;
out vec4 outColor;
vec4 unpackColor(uint c) {
  return vec4(float(c & 255u), float((c >> 8) & 255u), float((c >> 16) & 255u), float(c >> 24));
}
void main() {
  // Uploaded row zero is the top row; gl_FragCoord counts from the bottom.
  ivec2 p = ivec2(int(gl_FragCoord.x), u_height - 1 - int(gl_FragCoord.y));
  uint pixelColor = texelFetch(u_color, p, 0).r;
  uint light = texelFetch(u_light, p, 0).r & 0xffffffu;
  vec4 c = unpackColor(pixelColor);
  if (c.a != 255.0 && u_backgroundMode != 0) {
    vec3 bg = unpackColor(u_backgroundMode == 1 ? u_flat : texelFetch(u_background, p, 0).r).rgb;
    c.rgb = c.rgb * (c.a / 255.0) + bg * (1.0 - c.a / 255.0);
    c.a = 255.0;
  }
  if (light != 0u) {
    vec3 l = unpackColor(light).rgb * u_lightK;
    if (c.a < 255.0) {
      float pa = c.a / 255.0;
      vec3 pr = c.rgb * pa + l;
      float na = min(1.0, max(pa, max(l.r, max(l.g, l.b)) / 255.0));
      if (na > 0.0) { c.rgb = min(vec3(255.0), pr / na); c.a = na * 255.0; }
    } else c.rgb = min(vec3(255.0), c.rgb + l);
  }
  // Match Uint8ClampedArray's nearest-even byte conversion. Float32 arithmetic may differ by 1 byte.
  outColor = roundEven(clamp(c, 0.0, 255.0)) / 255.0;
}`;

/** GPU counterpart of the legacy composite(), not the cinematic/HDR compositor or a GPU painter.
 * Own this context exclusively. Native-size texelFetch preserves discrete pixel cells. */
export class WebGLCompositor {
  readonly gl: WebGL2RenderingContext;
  readonly renderer: string;
  private program!: WebGLProgram;
  private textures: WebGLTexture[] = [];
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private widths = [0, 0, 0]; private heights = [0, 0, 0];
  private disposed = false;
  private rendered = false;
  private maxTextureSize = 0;
  constructor(readonly canvas: WebGLCanvas) {
    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false,
      depth: false, stencil: false, preserveDrawingBuffer: true }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL2 context is unavailable');
    this.gl = gl;
    this.renderer = String(gl.getParameter(gl.RENDERER));
    const shaders: WebGLShader[] = [];
    try {
      const attributes = gl.getContextAttributes();
      if (!attributes || !attributes.alpha || attributes.premultipliedAlpha || attributes.antialias)
        throw new Error('WebGL context cannot preserve the requested straight-alpha, non-MSAA contract');
      this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Could not allocate WebGL shader');
        shaders.push(shader); gl.shaderSource(shader, source); gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(`WebGL shader compilation failed: ${gl.getShaderInfoLog(shader)}`);
      }
      const program = gl.createProgram();
      if (!program) throw new Error('Could not allocate WebGL program');
      this.program = program;
      shaders.forEach(shader => gl.attachShader(program, shader)); gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(`WebGL link failed: ${gl.getProgramInfoLog(program)}`);
      gl.useProgram(program);
      for (const name of ['color', 'light', 'background', 'flat', 'backgroundMode', 'height', 'lightK'])
        this.uniforms[name] = gl.getUniformLocation(program, `u_${name}`);
      for (let i = 0; i < 3; i++) {
        const texture = gl.createTexture(); if (!texture) throw new Error('Could not allocate WebGL texture');
        this.textures.push(texture); gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.uniform1i(this.uniforms.color, 0); gl.uniform1i(this.uniforms.light, 1); gl.uniform1i(this.uniforms.background, 2);
      this.upload(2, 1, 1, new Uint32Array(1));
      gl.disable(gl.BLEND); gl.disable(gl.DITHER); gl.disable(gl.DEPTH_TEST); gl.disable(gl.SCISSOR_TEST);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('WebGL compositor initialization failed');
    } catch (error) { this.dispose(); throw error; }
    finally { shaders.forEach(shader => gl.deleteShader(shader)); }
  }
  private upload(unit: number, width: number, height: number, pixels: Uint32Array): void {
    const gl = this.gl; gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, this.textures[unit]);
    if (this.widths[unit] !== width || this.heights[unit] !== height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R32UI, width, height, 0, gl.RED_INTEGER, gl.UNSIGNED_INT, pixels);
      this.widths[unit] = width; this.heights[unit] = height;
    } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RED_INTEGER, gl.UNSIGNED_INT, pixels);
  }
  render(frame: PaintFrame, background: CompositeBackground = null, lightK = 1): WebGLCanvas {
    validateCompositeFrame(frame, background, lightK);
    if (this.disposed || this.gl.isContextLost()) throw new Error('WebGL compositor is disposed or its context was lost');
    if (!Number.isFinite(Math.fround(lightK))) throw new RangeError('Light strength exceeds GPU float precision');
    const gl = this.gl;
    if (frame.w > this.maxTextureSize || frame.h > this.maxTextureSize) throw new RangeError('Frame exceeds this GPU texture size limit');
    if (this.canvas.width !== frame.w) this.canvas.width = frame.w;
    if (this.canvas.height !== frame.h) this.canvas.height = frame.h;
    if (gl.drawingBufferWidth !== frame.w || gl.drawingBufferHeight !== frame.h)
      throw new Error('WebGL drawing buffer could not retain the native frame dimensions');
    gl.viewport(0, 0, frame.w, frame.h); gl.useProgram(this.program);
    this.upload(0, frame.w, frame.h, frame.color); this.upload(1, frame.w, frame.h, frame.light);
    if (background instanceof Uint32Array) this.upload(2, frame.w, frame.h, background);
    gl.uniform1ui(this.uniforms.flat, typeof background === 'number' ? background >>> 0 : 0);
    gl.uniform1i(this.uniforms.backgroundMode, background === null ? 0 : typeof background === 'number' ? 1 : 2);
    gl.uniform1i(this.uniforms.height, frame.h); gl.uniform1f(this.uniforms.lightK, lightK);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (gl.getError() !== gl.NO_ERROR || gl.isContextLost()) throw new Error('WebGL compositing failed or context was lost');
    this.rendered = true;
    return this.canvas;
  }
  /** Diagnostic/export readback only. Normal presentation never reads pixels back to the CPU. */
  readPixels(): Uint8ClampedArray {
    if (this.disposed || this.gl.isContextLost() || !this.rendered) throw new Error('WebGL compositor has no available rendered frame');
    const { width: w, height: h } = this.canvas, bottomUp = new Uint8Array(w * h * 4), out = new Uint8ClampedArray(bottomUp.length);
    this.gl.readPixels(0, 0, w, h, this.gl.RGBA, this.gl.UNSIGNED_BYTE, bottomUp);
    if (this.gl.getError() !== this.gl.NO_ERROR) throw new Error('WebGL pixel readback failed');
    for (let y = 0; y < h; y++) out.set(bottomUp.subarray((h - y - 1) * w * 4, (h - y) * w * 4), y * w * 4);
    return out;
  }
  dispose(): void {
    if (this.disposed) return; this.disposed = true;
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
