import { emptyWorkspace, todayInTaipei, validateWorkspace } from "./domain.ts";

type Row = { data: string; revision: number };
export interface Database {
  prepare(sql: string): {
    bind(...values: (string | number)[]): {
      first<T>(): Promise<T | null>;
      run(): Promise<{ meta: { changes?: number } }>;
    };
  };
}
const headers = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers });
const MAX_BODY_BYTES = 1_048_576;

async function readBody(request: Request): Promise<unknown> {
  if (!request.body) throw new Error("缺少資料內容");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new RangeError("資料超過 1 MB 上限"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** ownerId is supplied only by the trusted server authentication adapter. */
export async function handleWorkspace(request: Request, ownerId: string | null, database: Database): Promise<Response> {
  if (!ownerId) return json({ error: "請先登入，再存取你的資料。" }, 401);
  if (!['GET', 'PUT'].includes(request.method)) return json({ error: "不支援的操作" }, 405);
  try {
    if (request.method === 'GET') {
      const row = await database.prepare("SELECT data, revision FROM workspaces WHERE owner_id = ?").bind(ownerId).first<Row>();
      return json({ workspace: row ? JSON.parse(row.data) : emptyWorkspace(todayInTaipei()), revision: row?.revision ?? 0 });
    }
    if (request.headers.get("origin") !== new URL(request.url).origin) return json({ error: "請從本站儲存資料。" }, 403);
    if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) return json({ error: "資料必須使用 JSON 格式。" }, 415);
    let workspace, revision: number;
    try {
      const body = await readBody(request) as { workspace: unknown; revision: unknown };
      if (!body || !Number.isSafeInteger(body.revision) || Number(body.revision) < 0 || Number(body.revision) > 1_000_000_000) throw new Error("資料版本無效，請重新整理。");
      revision = Number(body.revision);
      workspace = validateWorkspace(body.workspace);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "資料格式不正確。" }, error instanceof RangeError ? 413 : 400);
    }
    const data = JSON.stringify(workspace);
    const timestamp = new Date().toISOString();
    const result = revision === 0
      ? await database.prepare("INSERT INTO workspaces (owner_id, data, revision, updated_at) VALUES (?, ?, 1, ?) ON CONFLICT(owner_id) DO NOTHING").bind(ownerId, data, timestamp).run()
      : await database.prepare("UPDATE workspaces SET data = ?, revision = revision + 1, updated_at = ? WHERE owner_id = ? AND revision = ?").bind(data, timestamp, ownerId, revision).run();
    if (result.meta.changes !== 1) return json({ error: "其他分頁已更新這份資料。請先匯出目前資料作為備份，再重新整理頁面。" }, 409);
    return json({ revision: revision + 1, updatedAt: timestamp });
  } catch (error) {
    console.error("Workspace operation failed", error instanceof Error ? error.name : "UnknownError");
    return json({ error: "暫時無法存取資料，請稍後重試；畫面中的變更尚未儲存。" }, 503);
  }
}
