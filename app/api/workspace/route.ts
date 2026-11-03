import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../../chatgpt-auth";
import { handleWorkspace } from "../../../lib/workspace-service";

export const dynamic = "force-dynamic";
async function handle(request: Request) {
  const user = await getChatGPTUser();
  if (!user) return Response.json({ error: "請先登入，再存取你的資料。" }, { status: 401, headers: { "Cache-Control": "private, no-store" } });
  if (!env.DB) return Response.json({ error: "資料庫暫時無法連線。" }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  return handleWorkspace(request, user.userId, env.DB);
}
export const GET = handle;
export const PUT = handle;
