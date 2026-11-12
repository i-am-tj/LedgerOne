import { expect, it } from "vitest";
import { originalEvidence, lockOriginal, type CommandQuery } from "./original";
const result = (rows: Record<string, unknown>[]) => ({
  rows,
  rowCount: rows.length,
  command: "SELECT",
  oid: 0,
  fields: [],
});
it("C-T05 immutable ancestry cap/cycle/missing evidence fail closed without acquiring target/account row locks", async () => {
  for (const mode of ["cap", "cycle", "missing"]) {
    let calls = 0;
    const query: CommandQuery = async (sql, values) => {
      expect(sql).not.toMatch(/FOR (UPDATE|SHARE)/);
      expect(values?.slice(1)).toEqual(["workspace", "owner"]);
      calls++;
      const id = String(values![0]);
      if (mode === "missing" && id !== "0") return result([]);
      return result([
        {
          id,
          status: "POSTED",
          kind: "REVERSAL",
          operationKind: "REVERSE",
          operationId: "operation",
          reversesJournalId: mode === "cycle" ? id : String(Number(id) + 1),
        },
      ]);
    };
    await expect(
      originalEvidence(query, "owner", "workspace", "0"),
    ).rejects.toMatchObject({ status: 409, code: "target_unavailable" });
    expect(calls).toBe(mode === "cap" ? 128 : mode === "cycle" ? 1 : 2);
  }
});
it("C-T05 scoped original target lock rejects foreign, own-operation and direct reversal", async () => {
  for (const mode of ["missing", "own-operation", "reversed"]) {
    let calls = 0;
    const query: CommandQuery = async (sql) => {
      calls++;
      if (calls === 1) {
        expect(sql).toContain("FOR UPDATE");
        return result(
          mode === "missing"
            ? []
            : [
                {
                  status: "POSTED",
                  operationId: mode === "own-operation" ? "new" : "old",
                },
              ],
        );
      }
      return result([{ id: "direct-reversal" }]);
    };
    await expect(
      lockOriginal(query, "owner", "workspace", "original", "new"),
    ).rejects.toMatchObject({ status: mode === "missing" ? 404 : 409 });
  }
});
