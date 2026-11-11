import { serveOwned } from "@/lib/ownership/server";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return serveOwned(request, "workspace.item", (await context.params).id);
}
export async function PATCH(request: Request, context: Context) {
  return serveOwned(request, "workspace.item", (await context.params).id);
}
