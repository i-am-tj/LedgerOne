import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  parseCapital,
  capitalHash,
  capitalQuantities,
} from "./capital-contract";
import { parseTransaction } from "./contract";
const fd = {
  kind: "FD_FUNDING",
  sourceAccountId: randomUUID(),
  destinationAccountId: randomUUID(),
  amount: "10000",
  effectiveAt: "2026-01-05T00:00:00+05:30",
};
const loan = {
  kind: "LOAN_REPAYMENT",
  sourceAccountId: fd.sourceAccountId,
  destinationAccountId: fd.destinationAccountId,
  principal: "5000",
  interest: "600",
  effectiveAt: fd.effectiveAt,
};
it("canonical exact principal/interest/total and semantic binding", () => {
  const a = parseCapital(loan),
    b = parseCapital({ ...loan, principal: "5000.00", interest: "600.00" });
  expect(capitalQuantities(a)).toEqual({
    principal: 500000n,
    interest: 60000n,
    total: 560000n,
  });
  expect(capitalHash("owner", "scope", a)).toBe(
    capitalHash("owner", "scope", b),
  );
  expect(capitalHash("owner", "scope", a)).not.toBe(
    capitalHash(
      "owner",
      "scope",
      parseCapital({ ...loan, principal: "5100", interest: "500" }),
    ),
  );
  expect(capitalHash("other", "scope", a)).not.toBe(
    capitalHash("owner", "scope", a),
  );
  expect(parseTransaction(fd)).toEqual(parseCapital(fd));
  expect(parseCapital(fd).effectiveAt).toBe("2026-01-04T18:30:00.000Z");
  expect(
    capitalQuantities(parseCapital({ ...loan, interest: "0" })).total,
  ).toBe(500000n);
  expect(
    capitalQuantities(
      parseCapital({
        ...loan,
        principal: "9999999999999999.98",
        interest: "0.01",
      }),
    ).total,
  ).toBe(999999999999999999n);
});
it.each([
  { ...fd, amount: 0 },
  { ...fd, amount: "0" },
  { ...fd, amount: "-1" },
  { ...fd, amount: "1e3" },
  { ...fd, amount: "0.001" },
  { ...fd, ownerId: "forged" },
  { ...fd, interest: "600" },
  { ...fd, legs: [] },
  { ...fd, destinationAccountId: fd.sourceAccountId },
  { ...fd, currency: "USD" },
  { ...fd, effectiveAt: "2026-02-30T00:00:00Z" },
  { ...loan, principal: "0" },
  { ...loan, interest: "-1" },
  { ...loan, interestAccountId: randomUUID() },
  { ...loan, amount: "5600" },
  { ...loan, principal: "9999999999999999.99", interest: "0.01" },
  { ...loan, interest: 600 },
])("rejects unsafe capital payload %#", (v) =>
  expect(() => parseTransaction(v)).toThrow(),
);
