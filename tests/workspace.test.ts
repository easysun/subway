import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { handleWorkspace, type Database } from "../lib/workspace-service.ts";
import { emptyWorkspace } from "../lib/domain.ts";

function database(): Database {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("CREATE TABLE workspaces (owner_id TEXT PRIMARY KEY, data TEXT NOT NULL, revision INTEGER NOT NULL, updated_at TEXT NOT NULL)");
  return { prepare(sql) { return { bind(...values) { return {
    async first<T>() { return (sqlite.prepare(sql).get(...values) ?? null) as T | null; },
    async run() { const result = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(result.changes) } }; },
  }; } }; } };
}
const get = () => new Request("https://sub.ages.tw/api/workspace");
const put = (revision: number, workspace = emptyWorkspace("2026-11-03"), origin = "https://sub.ages.tw") => new Request("https://sub.ages.tw/api/workspace", { method: "PUT", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify({ revision, workspace }) });

test("anonymous read and write are rejected", async () => {
  const db = database();
  assert.equal((await handleWorkspace(get(), null, db)).status, 401);
  assert.equal((await handleWorkspace(put(0), null, db)).status, 401);
});
test("a second owner cannot read or overwrite the first owner's workspace", async () => {
  const db = database();
  const a = emptyWorkspace("2026-11-03"); a.settings.budgetMinor = 123456;
  assert.equal((await handleWorkspace(put(0, a), "owner-a", db)).status, 200);
  const b = await (await handleWorkspace(get(), "owner-b", db)).json() as { revision: number; workspace: ReturnType<typeof emptyWorkspace> };
  assert.equal(b.revision, 0); assert.notEqual(b.workspace.settings.budgetMinor, 123456);
  assert.equal((await handleWorkspace(put(1), "owner-b", db)).status, 409);
  assert.equal(((await (await handleWorkspace(get(), "owner-a", db)).json()) as { workspace: ReturnType<typeof emptyWorkspace> }).workspace.settings.budgetMinor, 123456);
});
test("same-revision concurrent updates allow only one writer", async () => {
  const db = database();
  await handleWorkspace(put(0), "owner", db);
  const responses = await Promise.all([handleWorkspace(put(1), "owner", db), handleWorkspace(put(1), "owner", db)]);
  assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
  assert.equal(((await (await handleWorkspace(get(), "owner", db)).json()) as { revision: number }).revision, 2);
});
test("duplicate initial creates never replace saved data", async () => {
  const db = database();
  assert.equal((await handleWorkspace(put(0), "owner", db)).status, 200);
  assert.equal((await handleWorkspace(put(0), "owner", db)).status, 409);
});
test("cross-origin and malformed writes are rejected before storage", async () => {
  const db = database();
  assert.equal((await handleWorkspace(put(0, emptyWorkspace("2026-11-03"), "https://other.example"), "owner", db)).status, 403);
  const malformed = new Request("https://sub.ages.tw/api/workspace", { method: "PUT", headers: { Origin: "https://sub.ages.tw", "Content-Type": "application/json" }, body: "{}" });
  assert.equal((await handleWorkspace(malformed, "owner", db)).status, 400);
  assert.equal(((await (await handleWorkspace(get(), "owner", db)).json()) as { revision: number }).revision, 0);
});
