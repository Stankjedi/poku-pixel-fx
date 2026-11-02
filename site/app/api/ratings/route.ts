import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import catalog from '@/public/effects/catalog.json';

export const dynamic = 'force-dynamic';
const builtinIds = new Set(catalog.effects.map(effect => `builtin:${effect.id}`));
const sharedId = /^shared:(\d{13}-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.png)$/;
const reply = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
const failure = (message: string, status: number) => reply({error:message},status);
async function voterHash(userId: string) {
  const data = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(data), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function readSmallJson(request: Request): Promise<unknown> {
  if (!request.body || !request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const reader = request.body.getReader(), chunks: Uint8Array[] = []; let length = 0;
  try { while (true) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > 1024) { await reader.cancel(); return null; } chunks.push(part.value); } }
  finally { reader.releaseLock(); }
  const all = new Uint8Array(length); let offset=0; for(const chunk of chunks) { all.set(chunk,offset); offset+=chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(all)); } catch { return null; }
}

type Row = { id: string; count: number; average: number; mine: number | null };
const selectSummary = `SELECT effect_id AS id, COUNT(*) AS count, AVG(score) AS average, MAX(CASE WHEN voter = ? THEN score END) AS mine FROM effect_ratings`;
export async function GET() {
  const db = env.DB; if (!db) return failure('평점 저장소가 연결되지 않았습니다.',503);
  const user = await getChatGPTUser(); const voter = user ? await voterHash(user.userId) : '';
  try {
    const result = await db.prepare(`${selectSummary} GROUP BY effect_id`).bind(voter).all<Row>();
    return reply({ratings:result.results});
  } catch { return failure('평점을 불러오지 못했습니다.',503); }
}
export async function PUT(request: Request) {
  const user = await getChatGPTUser(); if (!user) return failure('평점을 남기려면 ChatGPT로 로그인하세요.',401);
  if (request.headers.get('origin') !== new URL(request.url).origin) return failure('같은 사이트의 요청만 허용합니다.',403);
  const db = env.DB; if (!db) return failure('평점 저장소가 연결되지 않았습니다.',503);
  const value = await readSmallJson(request) as {id?:unknown;score?:unknown}|null;
  if (!value || typeof value.id !== 'string' || typeof value.score !== 'number' || !Number.isFinite(value.score) || value.score < 0.5 || value.score > 5 || !Number.isInteger(value.score * 2)) return failure('이펙트와 0.5~5점의 0.5점 단위 평점을 입력하세요.',400);
  const id = value.id, match = id.match(sharedId);
  if (!builtinIds.has(id) && !match) return failure('이펙트를 찾을 수 없습니다.',404);
  try {
    if (match && (!env.BUCKET || !await env.BUCKET.head(`shared/${match[1]}`))) return failure('이펙트를 찾을 수 없습니다.',404);
    const voter = await voterHash(user.userId);
    await db.prepare('INSERT INTO effect_ratings (effect_id, voter, score, updated) VALUES (?, ?, ?, ?) ON CONFLICT(effect_id, voter) DO UPDATE SET score = excluded.score, updated = excluded.updated').bind(id,voter,value.score as number,Date.now()).run();
    const row = await db.prepare(`${selectSummary} WHERE effect_id = ? GROUP BY effect_id`).bind(voter,id).first<Row>();
    return row ? reply(row) : failure('평점 확인에 실패했습니다.',503);
  } catch { return failure('평점을 저장하지 못했습니다.',503); }
}
