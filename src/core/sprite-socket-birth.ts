import type { SpriteClip2D, SpriteClipSocket2D } from "./sprite-clip.js";
import type { PixelTransform2D } from "./sprite-raster.js";

export interface SpriteSocketBirthOptions2D {
  clip: Pick<SpriteClip2D, "socketAt" | "frameAt">;
  socket: string;
  /** Effect clock and clip playback clock, both in seconds. Neither is advanced here. */
  birthTime: number;
  clipTime: number;
  /** [a,b,c,d,tx,ty], mapping pivot-relative clip coordinates into world space. */
  world: PixelTransform2D;
  /** Explicit handling when the requested socket and optional fallback are unavailable. */
  unavailable: "throw" | "skip";
  /** One authored alternative, sampled at the SAME clip time. No automatic role swapping. */
  fallbackSocket?: string;
  /** Socket-basis coordinates in pixels and pixels/second, respectively. Default zero. */
  offset?: readonly [number, number];
  velocity?: readonly [number, number];
}

/** A birth record, not another socket contract. Contains no live pose/root references. */
export interface SpriteSocketBirth2D {
  readonly birthTime: number;
  readonly clipTime: number;
  readonly frame: number;
  readonly requestedSocket: string;
  readonly resolvedSocket: string;
  readonly fallbackReason: "missing" | "hidden" | null;
  readonly x: number; readonly y: number;
  readonly vx: number; readonly vy: number;
  readonly basisX: readonly [number, number];
  readonly basisY: readonly [number, number];
}

const pair = (value: readonly number[]): boolean =>
  Array.isArray(value) && value.length === 2 && value.every(Number.isFinite);
const validName = (value: string): boolean => typeof value === "string" && value.trim().length > 0
  && !["__proto__", "prototype", "constructor"].includes(value);
const determinant = (a: number, b: number, c: number, d: number): number => a * d - b * c;
const invertible = (det: number): boolean => Number.isFinite(det) && Math.abs(det) >= 1e-12;

/** Capture once per caller-scheduled birth. Never call again to update an existing particle.
 * Missing/hidden data never becomes an origin emission. Invalid data always throws. */
export function captureSpriteSocketBirth2D(options: SpriteSocketBirthOptions2D): SpriteSocketBirth2D | null {
  const { clip, socket: requestedSocket, birthTime, clipTime, world,
    unavailable, fallbackSocket, offset = [0, 0], velocity = [0, 0] } = options;
  if (!validName(requestedSocket) || fallbackSocket !== undefined && !validName(fallbackSocket)
    || ![birthTime, clipTime].every(Number.isFinite)
    || !["throw", "skip"].includes(unavailable)
    || !Array.isArray(world) || world.length !== 6 || !world.every(Number.isFinite)
    || !pair(offset) || !pair(velocity)) throw new RangeError("Invalid sprite socket birth options");
  const [a, b, c, d, tx, ty] = world;
  const det = determinant(a, b, c, d);
  if (!invertible(det)) throw new RangeError("Socket birth world transform must be finite and invertible");
  const frame = clip.frameAt(clipTime);
  if (!Number.isSafeInteger(frame) || frame < -1)
    throw new RangeError("Socket birth frame must be -1 or a nonnegative safe integer");
  let resolvedSocket = requestedSocket;
  let socket = frame < 0 ? null : clip.socketAt(resolvedSocket, clipTime);
  const reason = (s: SpriteClipSocket2D | null): "missing" | "hidden" | null =>
    !s ? "missing" : s.visible === false ? "hidden" : null;
  const fallbackReason = reason(socket);
  if (fallbackReason && fallbackSocket !== undefined && frame >= 0) {
    resolvedSocket = fallbackSocket;
    socket = clip.socketAt(resolvedSocket, clipTime);
  }
  if (reason(socket)) {
    if (unavailable === "skip") return null;
    throw new RangeError(`Unavailable sprite socket ${resolvedSocket} at clip time ${clipTime}`);
  }
  const s = socket!;
  if (![s.x, s.y].every(Number.isFinite) || s.angle !== undefined && !Number.isFinite(s.angle)
    || s.visible !== undefined && typeof s.visible !== "boolean"
    || s.mirrorPolicy !== undefined && !["reflect", "swap-hand", "authored"].includes(s.mirrorPolicy)
    || (s.basisX === undefined) !== (s.basisY === undefined))
    throw new RangeError("Invalid sprite socket birth metadata");
  // A basis is authoritative when supplied; angle is the fallback orientation only.
  const angle = s.angle ?? 0;
  const bx = s.basisX ?? [Math.cos(angle), Math.sin(angle)];
  const by = s.basisY ?? [-Math.sin(angle), Math.cos(angle)];
  if (!pair(bx) || !pair(by) || !invertible(determinant(bx[0], bx[1], by[0], by[1])))
    throw new RangeError("Socket birth basis must be finite and invertible");
  // Omitted policy means geometric reflection. Authored handedness in the socket
  // itself is retained; an additional root reflection needs an explicit reflect policy.
  if (det < 0 && s.mirrorPolicy !== undefined && s.mirrorPolicy !== "reflect")
    throw new RangeError(`Socket birth does not support root reflection with ${s.mirrorPolicy} policy`);
  const basisX = [a * bx[0] + c * bx[1], b * bx[0] + d * bx[1]] as const;
  const basisY = [a * by[0] + c * by[1], b * by[0] + d * by[1]] as const;
  const x = tx + a * s.x + c * s.y + basisX[0] * offset[0] + basisY[0] * offset[1];
  const y = ty + b * s.x + d * s.y + basisX[1] * offset[0] + basisY[1] * offset[1];
  const vx = basisX[0] * velocity[0] + basisY[0] * velocity[1];
  const vy = basisX[1] * velocity[0] + basisY[1] * velocity[1];
  if (![x, y, vx, vy, ...basisX, ...basisY].every(Number.isFinite)
    || !invertible(determinant(...basisX, ...basisY)))
    throw new RangeError("Socket birth world result must be finite and invertible");
  return Object.freeze({ birthTime, clipTime, frame, requestedSocket, resolvedSocket,
    fallbackReason, x, y, vx, vy, basisX: Object.freeze(basisX), basisY: Object.freeze(basisY) });
}
