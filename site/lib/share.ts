/** Public PNG gallery on Sites R2. Authentication is supplied by the caller, not by browser input. */
import { reserveUpload, releaseUpload, type QuotaDatabase } from './quota';
import { parseSharedManifest } from './shared-manifest';
export interface StoredObject { key: string; customMetadata?: Record<string, string>; body: ReadableStream<Uint8Array>; etag?: string }
export interface ObjectSummary { key: string; customMetadata?: Record<string, string> }
export interface GalleryBucket {
  put(key: string, value: ArrayBuffer, options: { httpMetadata: { contentType: string }, customMetadata: Record<string, string>; onlyIf?: { etagMatches: string } }): Promise<unknown>;
  get(key: string): Promise<StoredObject | null>;
  list(options: { prefix: string; limit: number; cursor?: string; include: ['customMetadata'] }): Promise<{ objects: ObjectSummary[]; truncated: boolean; cursor?: string }>;
  delete(key: string): Promise<void>;
}
const PREFIX = 'shared/';
const MANIFEST_PREFIX = 'shared-manifests/';
const MAX_FILE = 5 * 1024 * 1024;
const MAX_BODY = MAX_FILE + 1024 * 1024 + 64 * 1024;
const MAX_PIXELS = 4_194_304;
const ID = /^\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png$/;
const headers = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
const error = (message: string, status: number) => json({ error: message }, status);
function originMatches(req: Request): boolean {
  const origin = req.headers.get('origin');
  return !!origin && origin === new URL(req.url).origin;
}
async function ownerHash(userId: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(hash), x => x.toString(16).padStart(2, '0')).join('');
}
async function boundedBody(req: Request): Promise<Uint8Array | null> {
  const length = Number(req.headers.get('content-length') || 0);
  if (!Number.isFinite(length) || length < 0 || length > MAX_BODY || !req.body) return null;
  const reader = req.body.getReader(), parts: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_BODY) { await reader.cancel(); return null; }
      parts.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const result = new Uint8Array(total); let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.byteLength; }
  return result;
}
function encodeTitle(title: string): string { return btoa(Array.from(new TextEncoder().encode(title), byte => String.fromCharCode(byte)).join('')); }
function decodeTitle(encoded: string | undefined): string { try { return encoded ? new TextDecoder().decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))) : '제목 없음'; } catch { return '제목 없음'; } }
// Self-reported creator model; absence is unknown, never inferred from site or agent identity.
function parseModel(value: FormDataEntryValue | null): string | null {
  if (value === null) return '';
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}]/u.test(value)) return null;
  const model = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  return model.length <= 80 ? model : null;
}
function storedModel(encoded: string | undefined): string | null {
  if (!encoded) return null;
  try { const value = new TextDecoder('utf-8', { fatal:true }).decode(Uint8Array.from(atob(encoded), c => c.charCodeAt(0))); return value && value.length <= 80 && !/[\p{Cc}\p{Cf}]/u.test(value) ? value : null; } catch { return null; }
}
type Animation = { frameWidth: number; frameHeight: number; frameCount: number; fps: number; loop: boolean };
function animationFromForm(form: FormData, data: ArrayBuffer): Animation | null {
  const frameWidth = Number(form.get('frameWidth')), frameHeight = Number(form.get('frameHeight'));
  const frameCount = Number(form.get('frameCount')), fps = Number(form.get('fps'));
  if (![frameWidth, frameHeight, frameCount, fps].every(Number.isInteger)) return null;
  if (frameWidth < 1 || frameHeight < 1 || frameCount < 1 || frameCount > 4096 || fps < 1 || fps > 240) return null;
  const view = new DataView(data), width = view.getUint32(16), height = view.getUint32(20);
  if (width % frameWidth || height % frameHeight || frameCount > (width / frameWidth) * (height / frameHeight)) return null;
  return { frameWidth, frameHeight, frameCount, fps, loop: form.get('loop') === 'yes' };
}
function storedAnimation(encoded: string | undefined): Animation | null {
  if (!encoded) return null;
  try { const a = JSON.parse(decodeTitle(encoded));
    return a && [a.frameWidth,a.frameHeight,a.frameCount,a.fps].every(Number.isInteger) && a.frameWidth > 0 && a.frameHeight > 0 && a.frameCount >= 1 && a.fps >= 1 && a.fps <= 240 ? a : null;
  } catch { return null; }
}
async function manifestFromForm(form: FormData, data: ArrayBuffer) {
  const value = form.get('manifest');
  if (value === null || value === '' || (value instanceof Blob && value.size === 0)) return null;
  if (value instanceof Blob && value.size > 1024 * 1024) throw new Error('JSON은 1MB 이하여야 합니다.');
  const text = typeof value === 'string' ? value : value instanceof Blob ? await value.text() : '';
  const view = new DataView(data);
  return parseSharedManifest(text, { w: view.getUint32(16), h: view.getUint32(20) });
}
function storedManifestKey(id: string, metadata: Record<string, string> | undefined): string | null {
  const key = metadata?.manifestKey;
  return key?.startsWith(`${MANIFEST_PREFIX}${id}/`) && /^[0-9a-f-]+\.json$/.test(key.slice(`${MANIFEST_PREFIX}${id}/`.length)) ? key : null;
}
async function writeManifest(bucket: GalleryBucket, id: string, content: string) {
  const key = `${MANIFEST_PREFIX}${id}/${crypto.randomUUID()}.json`;
  const bytes = new TextEncoder().encode(content);
  await bucket.put(key, bytes.buffer as ArrayBuffer, { httpMetadata: { contentType: 'application/json' }, customMetadata: {} });
  return key;
}
function validPng(bytes: Uint8Array): boolean {
  if (bytes.length < 33 || bytes.length > MAX_FILE) return false;
  const signature = [137,80,78,71,13,10,26,10];
  if (!signature.every((v, i) => bytes[i] === v) || bytes[12] !== 73 || bytes[13] !== 72 || bytes[14] !== 68 || bytes[15] !== 82) return false;
  const d = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (d.getUint32(8) !== 13) return false;
  const w = d.getUint32(16), h = d.getUint32(20);
  if (!(w > 0 && h > 0 && w <= 2048 && h <= 2048 && w * h <= MAX_PIXELS)) return false;
  // Verify the PNG chunk envelope and CRCs before storing. This is not an image decoder.
  let offset = 8, sawData = false, chunks = 0;
  while (offset + 12 <= bytes.length && ++chunks <= 10000) {
    const length = d.getUint32(offset), end = offset + 12 + length;
    if (end > bytes.length) return false;
    let crc = 0xffffffff;
    for (let i = offset + 4; i < offset + 8 + length; i++) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
    if (((crc ^ 0xffffffff) >>> 0) !== d.getUint32(offset + 8 + length)) return false;
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    if (type === 'IDAT') sawData = true;
    if (type === 'IEND') return length === 0 && sawData && end === bytes.length;
    if (offset !== 8 && type === 'IHDR') return false;
    offset = end;
  }
  return false;
}
export async function upload(req: Request, bucket: GalleryBucket, db: QuotaDatabase, userId: string | null): Promise<Response> {
  if (!userId) return error('게시하려면 ChatGPT에 로그인하세요.', 401);
  if (!originMatches(req)) return error('같은 사이트에서 보낸 요청만 허용합니다.', 403);
  const contentType = req.headers.get('content-type') ?? '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data;')) return error('업로드 형식이 올바르지 않습니다.', 400);
  const body = await boundedBody(req);
  if (!body) return error('업로드는 PNG 5MB 이하만 가능합니다.', 413);
  let form: FormData;
  try { form = await new Response(body.buffer as ArrayBuffer, { headers: { 'content-type': contentType } }).formData(); }
  catch { return error('업로드 양식을 읽을 수 없습니다.', 400); }
  const titleValue = form.get('title'), consent = form.get('rights'), file = form.get('file');
  const model = parseModel(form.get('model'));
  if (model === null) return error('제작 모델은 제어문자 없이 80자 이내로 입력하세요.', 400);
  const rawTags = form.get('tags');
  const tags = typeof rawTags === 'string' ? [...new Set(rawTags.split(',').map(t => t.trim().normalize('NFC')).filter(Boolean))] : [];
  if (tags.length > 8 || tags.some(t => t.length > 20 || !/^[\p{L}\p{N}_-]+$/u.test(t))) return error('태그는 쉼표로 구분해 8개까지, 각 20자 이내의 문자·숫자·밑줄·하이픈을 사용하세요.', 400);
  const title = typeof titleValue === 'string' ? titleValue.trim().replace(/\s+/g, ' ') : '';
  if (title.length < 1 || title.length > 80 || /[\x00-\x1f\x7f]/.test(title)) return error('제목은 1~80자로 입력하세요.', 400);
  if (consent !== 'yes') return error('게시 권한과 책임에 동의해야 합니다.', 400);
  if (!(file instanceof Blob) || file.type !== 'image/png' || file.size > MAX_FILE) return error('PNG 파일만 5MB 이하로 올릴 수 있습니다.', 400);
  const data = new Uint8Array(await file.arrayBuffer());
  if (!validPng(data)) return error('PNG 파일 헤더가 올바르지 않거나 이미지가 2048×2048을 초과합니다.', 400);
  let manifest;
  try { manifest = await manifestFromForm(form, data.buffer as ArrayBuffer); }
  catch (e) { return error(e instanceof Error ? e.message : 'JSON을 읽을 수 없습니다.', 400); }
  const animation = manifest?.playback.animation ?? animationFromForm(form, data.buffer as ArrayBuffer);
  if (!animation) return error('프레임 크기, 프레임 수, FPS가 시트와 맞는지 확인하세요.', 400);
  // The declaration is recorded; it does not establish actual ownership or licensing.
  const now = new Date(); const id = `${String(9999999999999 - Date.now()).padStart(13, '0')}-${crypto.randomUUID()}.png`;
  let reserved: boolean;
  try { reserved = await reserveUpload(db, id, userId); }
  catch { return error('업로드 제한을 확인할 수 없어 게시하지 못했습니다.', 503); }
  if (!reserved) return error('계정당 게시 50개 또는 업로드 횟수 제한(10분 5회, 24시간 20회)에 도달했습니다.', 429);
  let manifestKey: string | undefined;
  try {
    if (manifest) manifestKey = await writeManifest(bucket, id, manifest.json);
    await bucket.put(PREFIX + id, data.buffer as ArrayBuffer, { httpMetadata: { contentType: 'image/png' }, customMetadata: {
      title64: encodeTitle(title), tags64: encodeTitle(JSON.stringify(tags)), model64: encodeTitle(model), animation64: encodeTitle(JSON.stringify(animation)), created: now.toISOString(), owner: await ownerHash(userId), rightsDeclaration: 'v1',
      ...(manifestKey ? { manifestKey, manifestVersion: 'original-v1' } : {}),
    }});
  } catch {
    if (manifestKey) try { await bucket.delete(manifestKey); } catch { /* Reconcile orphan sidecars separately. */ }
    try { await releaseUpload(db, id, userId); } catch { /* An operator must reconcile this reservation. */ }
    return error('저장에 실패했습니다. 나중에 다시 시도해 주세요.', 503);
  }
  return json({ id, title, created: now.toISOString() }, 201);
}
export async function read(req: Request, bucket: GalleryBucket, userId: string | null): Promise<Response> {
  const url = new URL(req.url), id = url.searchParams.get('id');
  if (id !== null) {
    if (!ID.test(id)) return error('파일을 찾을 수 없습니다.', 404);
    const item = await bucket.get(PREFIX + id);
    if (!item) return error('파일을 찾을 수 없습니다.', 404);
    if (url.searchParams.get('format') === 'manifest') {
      const key = storedManifestKey(id, item.customMetadata);
      if (key) {
        const manifest = await bucket.get(key);
        if (!manifest) return error('원본 JSON을 찾을 수 없습니다.', 404);
        return new Response(manifest.body, { headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Content-Disposition': 'attachment; filename="effect.json"' } });
      }
      // Legacy entries never claimed to retain a source manifest. Keep them readable.
      const animation = storedAnimation(item.customMetadata?.animation64);
      if (!animation) return error('재생 정보가 없습니다.', 404);
      const bytes = await new Response(item.body).arrayBuffer(), view = new DataView(bytes), width = view.getUint32(16), height = view.getUint32(20);
      const columns = Math.floor(width / animation.frameWidth);
      const frames = Array.from({ length: animation.frameCount }, (_, i) => ({ filename: `effect ${i}`,
        frame: { x: i % columns * animation.frameWidth, y: Math.floor(i / columns) * animation.frameHeight, w: animation.frameWidth, h: animation.frameHeight },
        duration: Math.round((i + 1) * 1000 / animation.fps) - Math.round(i * 1000 / animation.fps) }));
      return json({ frames, meta: { image: 'effect.png', size: { w: width, h: height }, pokuFx: { ...animation, reconstructedLegacy: true } } });
    }
    return new Response(item.body, { headers: { ...headers, 'Content-Type': 'image/png', 'Content-Disposition': 'inline; filename="effect.png"' } });
  }
  const cursor = url.searchParams.get('cursor') ?? undefined;
  if (cursor && cursor.length > 2048) return error('페이지 정보가 올바르지 않습니다.', 400);
  let result;
  try { result = await bucket.list({ prefix: PREFIX, limit: 30, cursor, include: ['customMetadata'] }); }
  catch { return error('공유 목록을 불러오지 못했습니다.', 400); }
  const owner = userId ? await ownerHash(userId) : null;
  return json({ items: result.objects.filter(item => ID.test(item.key.slice(PREFIX.length))).map(item => ({
    id: item.key.slice(PREFIX.length), title: decodeTitle(item.customMetadata?.title64), created: item.customMetadata?.created ?? '',
    tags: (() => { try { const t = JSON.parse(decodeTitle(item.customMetadata?.tags64)); return Array.isArray(t) ? t.filter((x: unknown) => typeof x === 'string') : []; } catch { return []; } })(),
    animation: storedAnimation(item.customMetadata?.animation64),
    manifest: !!storedManifestKey(item.key.slice(PREFIX.length), item.customMetadata),
    model: storedModel(item.customMetadata?.model64),
    owned: !!owner && item.customMetadata?.owner === owner,
  })), next: result.truncated ? result.cursor ?? null : null });
}
export async function edit(req: Request, bucket: GalleryBucket, userId: string | null): Promise<Response> {
  if (!userId) return error('수정하려면 로그인하세요.', 401);
  if (!originMatches(req)) return error('같은 사이트에서 보낸 요청만 허용합니다.', 403);
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !ID.test(id)) return error('파일을 찾을 수 없습니다.', 404);
  const type = req.headers.get('content-type') ?? '';
  if (!type.toLowerCase().startsWith('multipart/form-data;')) return error('수정 형식이 올바르지 않습니다.', 400);
  const body = await boundedBody(req); if (!body) return error('파일 크기가 너무 큽니다.', 413);
  let form: FormData;
  try { form = await new Response(body.buffer as ArrayBuffer, { headers: { 'content-type': type } }).formData(); }
  catch { return error('수정 양식을 읽을 수 없습니다.', 400); }
  const rawTitle = form.get('title'), rawTags = form.get('tags'), file = form.get('file');
  const rawModel = form.get('model'), model = parseModel(rawModel);
  if (model === null) return error('제작 모델은 제어문자 없이 80자 이내로 입력하세요.', 400);
  const title = typeof rawTitle === 'string' ? rawTitle.trim().replace(/\s+/g, ' ') : '';
  const tags = typeof rawTags === 'string' ? [...new Set(rawTags.split(',').map(t => t.trim().normalize('NFC')).filter(Boolean))] : [];
  if (!title || title.length > 80 || /[\x00-\x1f\x7f]/.test(title)) return error('제목은 1~80자로 입력하세요.', 400);
  if (tags.length > 8 || tags.some(t => t.length > 20 || !/^[\p{L}\p{N}_-]+$/u.test(t))) return error('태그는 문자·숫자·밑줄·하이픈으로 8개까지 입력하세요.', 400);
  const item = await bucket.get(PREFIX + id);
  if (!item) return error('파일을 찾을 수 없습니다.', 404);
  if (item.customMetadata?.owner !== await ownerHash(userId)) return error('본인이 게시한 작품만 수정할 수 있습니다.', 403);
  if (!item.etag) return error('파일 버전을 확인할 수 없어 수정하지 못했습니다.', 503);
  let data: ArrayBuffer;
  const replaceImage = file instanceof Blob && file.size > 0;
  if (replaceImage) {
    if (form.get('rights') !== 'yes') return error('새 파일의 게시 권한과 책임에 동의해야 합니다.', 400);
    if (file.type !== 'image/png' || file.size > MAX_FILE) return error('PNG 파일만 5MB 이하로 올릴 수 있습니다.', 400);
    data = await file.arrayBuffer();
    if (!validPng(new Uint8Array(data))) return error('PNG 형식 또는 크기가 올바르지 않습니다.', 400);
  } else data = await new Response(item.body).arrayBuffer();
  let manifest;
  try { manifest = await manifestFromForm(form, data); }
  catch (e) { return error(e instanceof Error ? e.message : 'JSON을 읽을 수 없습니다.', 400); }
  const oldKey = storedManifestKey(id, item.customMetadata);
  const animation = manifest?.playback.animation ?? (!replaceImage && oldKey ? storedAnimation(item.customMetadata?.animation64) : animationFromForm(form, data));
  if (!animation) return error('프레임 크기, 프레임 수, FPS가 시트와 맞는지 확인하세요.', 400);
  const metadata: Record<string, string> = { ...item.customMetadata, title64: encodeTitle(title), tags64: encodeTitle(JSON.stringify(tags)),
    ...(rawModel === null ? {} : { model64: encodeTitle(model) }), animation64: encodeTitle(JSON.stringify(animation)) };
  if (replaceImage && !manifest) { delete metadata.manifestKey; delete metadata.manifestVersion; }
  let newKey: string | undefined;
  try {
    if (manifest) { newKey = await writeManifest(bucket, id, manifest.json); metadata.manifestKey = newKey; metadata.manifestVersion = 'original-v1'; }
    const result = await bucket.put(PREFIX + id, data, { httpMetadata: {contentType:'image/png'}, customMetadata: metadata, onlyIf:{etagMatches:item.etag} });
    if (!result) {
      if (newKey) await bucket.delete(newKey);
      return error('작품이 변경되어 저장하지 못했습니다. 새로고침 후 다시 시도하세요.', 409);
    }
  } catch {
    if (newKey) try { await bucket.delete(newKey); } catch { /* Preserve the original entry on failure. */ }
    return error('수정하지 못했습니다. 나중에 다시 시도해 주세요.', 503);
  }
  if (oldKey && oldKey !== metadata.manifestKey) try { await bucket.delete(oldKey); } catch { /* New revision is already committed. */ }
  return json({updated:true});
}
export async function remove(req: Request, bucket: GalleryBucket, db: QuotaDatabase, userId: string | null): Promise<Response> {
  if (!userId) return error('삭제하려면 로그인하세요.', 401);
  if (!originMatches(req)) return error('같은 사이트에서 보낸 요청만 허용합니다.', 403);
  const id = new URL(req.url).searchParams.get('id');
  if (!id || !ID.test(id)) return error('파일을 찾을 수 없습니다.', 404);
  const item = await bucket.get(PREFIX + id);
  if (!item) return error('파일을 찾을 수 없습니다.', 404);
  if (item.customMetadata?.owner !== await ownerHash(userId)) return error('본인이 게시한 작품만 삭제할 수 있습니다.', 403);
  try { await bucket.delete(PREFIX + id); }
  catch { return error('삭제하지 못했습니다. 나중에 다시 시도해 주세요.', 503); }
  const manifestKey = storedManifestKey(id, item.customMetadata);
  if (manifestKey) try { await bucket.delete(manifestKey); } catch { /* Image deletion has succeeded; orphan cleanup is safe. */ }
  try { await releaseUpload(db, id, userId); }
  catch { return error('이미지는 삭제되었지만 게시 한도를 갱신하지 못했습니다. 관리자에게 문의해 주세요.', 503); }
  return json({ deleted: true });
}
