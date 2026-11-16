import "server-only";
import { getAuthRuntime } from "../auth/server";
import { getDatabase } from "../database";
import { databaseSettings } from "../profile";
import { getAccountExecutor } from "../accounts/capability";
import { authJSON } from "../auth/requests";
import { handleTransactions } from "./http";
export async function transactionRequest(request: Request) {
  try {
    const settings = databaseSettings(process.env);
    if (settings.schema !== "public" && settings.schema !== "ledgerone")
      throw Error("Invalid schema");
    // Provisioned only on the existing isolated local app. Generic routes remain null.
    const executor =
      request.method === "POST" ? await getAccountExecutor() : null;
    return await handleTransactions(
      request,
      getAuthRuntime(),
      getDatabase(),
      executor,
      settings.schema,
    );
  } catch {
    return authJSON({ error: "service_unavailable" }, 503);
  }
}
