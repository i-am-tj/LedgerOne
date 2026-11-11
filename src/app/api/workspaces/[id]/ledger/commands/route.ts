import { getAuthRuntime } from "@/lib/auth/server";
import { postRequest } from "@/lib/ledger/commands/http";
import { authJSON } from "@/lib/auth/requests";
import { randomUUID } from "node:crypto";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    // S06D must supply a reviewed exposure mechanism. There is deliberately no
    // env flag, connection-string switch or production write executor here.
    return await postRequest(
      request,
      (await context.params).id,
      getAuthRuntime(),
      null,
    );
  } catch {
    const response = authJSON({ error: "service_unavailable" }, 503);
    response.headers.set("X-Request-ID", randomUUID());
    return response;
  }
}
