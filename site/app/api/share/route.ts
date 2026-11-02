import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
import { read, upload, remove, edit, type GalleryBucket } from '@/lib/share';
import type { QuotaDatabase } from '@/lib/quota';

export const dynamic = 'force-dynamic';
async function context() {
  const user = await getChatGPTUser();
  return { bucket: env.BUCKET as unknown as GalleryBucket | undefined, db: env.DB as unknown as QuotaDatabase | undefined, userId: user?.userId ?? null };
}
const unavailable = () => Response.json({ error: '공유 저장소가 아직 연결되지 않았습니다.' }, { status: 503 });
export async function GET(request: Request) {
  const { bucket, userId } = await context();
  return bucket ? read(request, bucket, userId) : unavailable();
}
export async function POST(request: Request) {
  const { bucket, db, userId } = await context();
  return bucket && db ? upload(request, bucket, db, userId) : unavailable();
}
export async function DELETE(request: Request) {
  const { bucket, db, userId } = await context();
  return bucket && db ? remove(request, bucket, db, userId) : unavailable();
}

export async function PATCH(request: Request) {
  const { bucket, userId } = await context();
  return bucket ? edit(request, bucket, userId) : unavailable();
}
