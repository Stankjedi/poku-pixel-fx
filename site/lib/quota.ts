/** D1 reservation for public gallery uploads. Fail closed if D1 is unavailable. */
export interface QuotaStatement {
  bind(...values: (string | number)[]): QuotaStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}
export interface QuotaDatabase { prepare(sql: string): QuotaStatement }

async function hashOwner(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  return Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2, '0')).join('');
}

/** Single atomic SQLite INSERT checks and reserves capacity across concurrent requests. */
export async function reserveUpload(db: QuotaDatabase, id: string, userId: string): Promise<boolean> {
  const owner = await hashOwner(userId);
  const now = Date.now();
  const row = await db.prepare(`
    INSERT INTO gallery_uploads (id, owner, created, active)
    SELECT ?, ?, ?, 1
    WHERE (SELECT COUNT(*) FROM gallery_uploads WHERE owner = ? AND active = 1) < 50
      AND (SELECT COUNT(*) FROM gallery_uploads WHERE owner = ? AND created >= ?) < 5
      AND (SELECT COUNT(*) FROM gallery_uploads WHERE owner = ? AND created >= ?) < 20
    RETURNING id
  `).bind(id, owner, now, owner, owner, now - 10 * 60_000, owner, now - 24 * 60 * 60_000).first<{ id: string }>();
  return row !== null;
}

/** Idempotently release a reservation; attempt remains counted for rate limiting. */
export async function releaseUpload(db: QuotaDatabase, id: string, userId: string): Promise<void> {
  const owner = await hashOwner(userId);
  await db.prepare('UPDATE gallery_uploads SET active = 0 WHERE id = ? AND owner = ? AND active = 1')
    .bind(id, owner).run();
}
