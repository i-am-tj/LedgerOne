import "server-only";
import type pg from "pg";
import { CommandError, inversePostings, type Leg } from "./contract";
export type CommandQuery = (
  sql: string,
  values?: unknown[],
) => Promise<pg.QueryResult>;
export const targetUnavailable = () =>
  new CommandError(409, "target_unavailable");
// Posted meaning/provenance is immutable. Discovery intentionally takes no row
// lock: determine the complete account union before locking the exact target.
export async function originalEvidence(
  query: CommandQuery,
  owner: string,
  workspace: string,
  id: string,
): Promise<readonly Leg[]> {
  let node: string | null = id;
  const visited = new Set<string>();
  while (node !== null) {
    if (visited.size >= 128 || visited.has(node)) throw targetUnavailable();
    visited.add(node);
    const row:
      | {
          id: string;
          kind: string;
          status: string;
          reversesJournalId: string | null;
          operationId: string;
          operationKind: string;
        }
      | undefined = (
      await query(
        'SELECT j.id,j.kind,j.status,j."reversesJournalId",j."operationId",o.kind AS "operationKind" FROM journal j JOIN ledger_operation o ON o.id=j."operationId" AND o."workspaceId"=j."workspaceId" AND o."ownerId"=j."ownerId" WHERE j.id=$1 AND j."workspaceId"=$2 AND j."ownerId"=$3',
        [node, workspace, owner],
      )
    ).rows[0];
    if (!row) {
      // A draft has no operation. Its owned existence gets the same eligibility
      // conflict as another unsupported owned target, never a foreign hint.
      if (
        node === id &&
        !(
          await query(
            'SELECT id FROM journal WHERE id=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
            [id, workspace, owner],
          )
        ).rowCount
      )
        throw new CommandError(404, "not_found");
      throw targetUnavailable();
    }
    if (row.status !== "POSTED" || row.kind === "OPENING")
      throw targetUnavailable();
    if (row.kind === "REVERSAL") {
      if (!row.reversesJournalId) throw targetUnavailable();
      node = row.reversesJournalId;
    } else if (row.kind === "GENERAL" && row.operationKind === "CORRECT") {
      const prior = await query(
        'SELECT "reversesJournalId" FROM journal WHERE "operationId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3 AND kind=\'REVERSAL\' AND status=\'POSTED\'',
        [row.operationId, workspace, owner],
      );
      if (prior.rowCount !== 1 || !prior.rows[0].reversesJournalId)
        throw targetUnavailable();
      node = prior.rows[0].reversesJournalId;
    } else if (row.kind === "GENERAL" && row.operationKind === "POST")
      node = null;
    else throw targetUnavailable();
  }
  const rows = await query(
    'SELECT "accountId",side,"currencyCode" AS currency,"nativeMinor"::text,"functionalMinor"::text,"fxRateId" FROM posting WHERE "journalId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3 ORDER BY id',
    [id, workspace, owner],
  );
  return inversePostings(rows.rows);
}
export async function lockOriginal(
  query: CommandQuery,
  owner: string,
  workspace: string,
  id: string,
  newOperation: string,
) {
  const r = await query(
    'SELECT status,"operationId" FROM journal WHERE id=$1 AND "workspaceId"=$2 AND "ownerId"=$3 FOR UPDATE',
    [id, workspace, owner],
  );
  if (r.rowCount !== 1) throw new CommandError(404, "not_found");
  if (r.rows[0].status !== "POSTED" || r.rows[0].operationId === newOperation)
    throw targetUnavailable();
  if (
    (
      await query(
        'SELECT id FROM journal WHERE "reversesJournalId"=$1 AND "workspaceId"=$2 AND "ownerId"=$3',
        [id, workspace, owner],
      )
    ).rowCount
  )
    throw targetUnavailable();
}
