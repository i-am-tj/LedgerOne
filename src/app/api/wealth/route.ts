import { wealthRequest } from "@/lib/wealth/server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  return wealthRequest(request);
}
