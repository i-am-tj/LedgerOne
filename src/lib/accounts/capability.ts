import "server-only";
import { readFileSync } from "node:fs";
import { PostExecutor } from "../ledger/commands/executor";
let capability: Promise<PostExecutor> | undefined;
// Only the explicitly provisioned disposable local application obtains typed
// account and transaction-template writes. The generic ledger route never imports this capability.
export function getAccountExecutor() {
  if (
    process.env.LEDGERONE_ENV !== "test" ||
    !process.env.LEDGERONE_ACCOUNT_CAPABILITY_FILE
  )
    return null;
  capability ??= PostExecutor.disposable(
    JSON.parse(
      readFileSync(process.env.LEDGERONE_ACCOUNT_CAPABILITY_FILE, "utf8"),
    ),
  );
  return capability;
}
