import { serveOwned } from "@/lib/ownership/server";
export const dynamic = "force-dynamic";
export function GET(request: Request) {
  return serveOwned(request, "audit.list");
}
