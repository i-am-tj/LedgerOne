import { getAuthRuntime } from "@/lib/auth/server";
import { authJSON, getOwnerSession } from "@/lib/auth/requests";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const runtime = getAuthRuntime();
    if (!runtime) return authJSON({ error: "authentication_unavailable" }, 503);
    const session = await getOwnerSession(
      runtime.auth,
      runtime.config,
      request.headers,
    );
    return session
      ? authJSON(session)
      : authJSON({ error: "unauthorized" }, 401);
  } catch {
    return authJSON({ error: "authentication_unavailable" }, 503);
  }
}
