/** Validate the playback envelope while retaining the complete authored JSON. */
export interface SharedAnimation { frameWidth: number; frameHeight: number; frameCount: number; fps: number; loop: boolean }
export interface SharedFrame {
  frame: { x: number; y: number; w: number; h: number };
  sourceSize: { w: number; h: number };
  spriteSourceSize: { x: number; y: number; w: number; h: number };
  duration: number;
}
export interface SharedPlayback { frames: SharedFrame[]; loop: boolean; durationMs: number; animation: SharedAnimation }
const object = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;

export function sharedPlayback(value: unknown, imageSize?: { w: number; h: number }): SharedPlayback {
  if (!object(value)) throw new Error('시트 JSON은 객체여야 합니다.');
  const frames: unknown[] = Array.isArray(value.frames) ? value.frames : object(value.frames) ? Object.values(value.frames) : [];
  if (frames.length < 1 || frames.length > 4096) throw new Error('JSON은 1~4096프레임을 포함해야 합니다.');
  if (value.schema === 'poku-asset/v1' && (!Array.isArray(value.pages) || value.pages.length !== 1))
    throw new Error('공유 갤러리는 한 PNG의 manifest를 받습니다. 여러 atlas page는 게임 자산 묶음으로 사용하세요.');
  const declared = value.meta?.size ?? (value.pages?.[0] ? { w: value.pages[0].width, h: value.pages[0].height } : undefined);
  if (imageSize && declared && (declared.w !== imageSize.w || declared.h !== imageSize.h)) throw new Error('PNG와 JSON의 시트 크기가 다릅니다.');
  let total = 0;
  const normalized = frames.map((raw, i): SharedFrame => {
    if (!object(raw)) throw new Error(`프레임 ${i} 형식이 올바르지 않습니다.`);
    const area = raw.frame ?? raw.rect;
    if (!object(area) || !int(area.x, 0, 16384) || !int(area.y, 0, 16384) || !int(area.w, 1, 4096) || !int(area.h, 1, 4096)
      || raw.rotated === true || (raw.page !== undefined && raw.page !== 0)) throw new Error(`프레임 ${i}의 사각형을 확인하세요.`);
    if (imageSize && (area.x + area.w > imageSize.w || area.y + area.h > imageSize.h)) throw new Error(`프레임 ${i}가 PNG 범위를 벗어납니다.`);
    const source = Array.isArray(raw.sourceSize) ? { w: raw.sourceSize[0], h: raw.sourceSize[1] } : raw.sourceSize ?? { w: area.w, h: area.h };
    const trim = raw.spriteSourceSize ?? (Array.isArray(raw.trimOffset)
      ? { x: raw.trimOffset[0], y: raw.trimOffset[1], w: area.w, h: area.h } : { x: 0, y: 0, w: area.w, h: area.h });
    if (!object(source) || !int(source.w, 1, 4096) || !int(source.h, 1, 4096) || source.w * source.h > 4_194_304
      || !object(trim) || !int(trim.x, 0, 4096) || !int(trim.y, 0, 4096) || trim.w !== area.w || trim.h !== area.h
      || trim.x + area.w > source.w || trim.y + area.h > source.h) throw new Error(`프레임 ${i}의 원본 크기/트리밍 정보가 올바르지 않습니다.`);
    if (typeof raw.duration !== 'number' || !Number.isFinite(raw.duration) || raw.duration <= 0 || raw.duration > 3_600_000)
      throw new Error(`프레임 ${i}의 지속시간이 올바르지 않습니다.`);
    total += raw.duration;
    return { frame: { x: area.x, y: area.y, w: area.w, h: area.h },
      sourceSize: { w: source.w, h: source.h }, spriteSourceSize: { x: trim.x, y: trim.y, w: trim.w, h: trim.h }, duration: raw.duration };
  });
  const loop = value.meta?.pokuFx?.loop === true || value.loop === true;
  return { frames: normalized, loop, durationMs: total, animation: {
    frameWidth: normalized[0].sourceSize.w, frameHeight: normalized[0].sourceSize.h,
    frameCount: frames.length, fps: Math.max(1, Math.min(240, Math.round(frames.length * 1000 / total))), loop,
  } };
}

export function parseSharedManifest(text: string, imageSize: { w: number; h: number }) {
  if (new TextEncoder().encode(text).length > 1024 * 1024) throw new Error('JSON은 1MB 이하여야 합니다.');
  const manifest: unknown = JSON.parse(text);
  const playback = sharedPlayback(manifest, imageSize);
  return { manifest, playback, json: JSON.stringify(manifest) };
}

/** Relink a downloaded PNG while retaining every authored field and file digest. */
export function relinkSharedManifestImage(value: unknown, image: string): Record<string, unknown> {
  sharedPlayback(value);
  if (!object(value)) throw new Error('시트 JSON은 객체여야 합니다.');
  const manifest = structuredClone(value);
  if (object(manifest.meta)) manifest.meta.image = image;
  if (manifest.schema === 'poku-asset/v1' && Array.isArray(manifest.pages) && object(manifest.pages[0])) {
    const old = manifest.pages[0].image;
    manifest.pages[0].image = image;
    if (Array.isArray(manifest.files)) {
      for (const file of manifest.files) if (object(file) && file.path === old) file.path = image;
    }
  }
  return manifest;
}
