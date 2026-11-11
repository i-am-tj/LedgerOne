import { getAuthRuntime } from "@/lib/auth/server";
import { authJSON, handleAuthRequest } from "@/lib/auth/requests";
export const dynamic = "force-dynamic";
async function handler(request: Request) {
  try {
    const runtime = getAuthRuntime();
    if (!runtime) return authJSON({ error: "authentication_unavailable" }, 503);
    return await handleAuthRequest(request, runtime.auth, runtime.config);
  } catch {
    return authJSON({ error: "authentication_unavailable" }, 503);
  }
}
export { handler as GET, handler as POST };
