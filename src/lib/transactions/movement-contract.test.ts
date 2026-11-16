import { describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { movementHash, parseMovement } from "./movement-contract";
import { parseTransaction } from "./contract";
const transfer = {
  kind: "TRANSFER",
  sourceAccountId: randomUUID(),
  destinationAccountId: randomUUID(),
  amount: "5000",
  effectiveAt: "2026-01-15T00:00:00+05:30",
};
describe("S08-B strict economic commands", () => {
  it("normalizes exact quantities and dates for replay while binding direction/kind/owner", () => {
    const a = parseMovement(transfer),
      b = parseMovement({ ...transfer, amount: "5000.00" });
    expect(a.effectiveAt).toBe("2026-01-14T18:30:00.000Z");
    expect(movementHash("owner", "workspace", a)).toBe(
      movementHash("owner", "workspace", b),
    );
    for (const command of [
      { ...a, kind: "CARD_SETTLEMENT" as const },
      {
        ...a,
        sourceAccountId: a.destinationAccountId,
        destinationAccountId: a.sourceAccountId,
      },
      { ...a, description: "Other" },
    ])
      expect(movementHash("owner", "workspace", command)).not.toBe(
        movementHash("owner", "workspace", a),
      );
    expect(movementHash("other", "workspace", a)).not.toBe(
      movementHash("owner", "workspace", a),
    );
    expect(parseTransaction(transfer)).toEqual(a);
  });
  it.each([
    { ...transfer, amount: "0" },
    { ...transfer, amount: "-1" },
    { ...transfer, amount: 5000 },
    { ...transfer, amount: "0.001" },
    { ...transfer, amount: "1e3" },
    { ...transfer, amount: "10000000000000000" },
    { ...transfer, destinationAccountId: transfer.sourceAccountId },
    { ...transfer, kind: "FD_TRANSFER" },
    { ...transfer, currency: "USD" },
    { ...transfer, category: "Groceries" },
    { ...transfer, ownerId: "forged" },
    { ...transfer, legs: [] },
    { ...transfer, effectiveAt: "2026-02-30T00:00:00Z" },
    { ...transfer, description: "\0" },
  ])("rejects invalid or forged payload %#", (v) =>
    expect(() => parseTransaction(v)).toThrow(),
  );
});
