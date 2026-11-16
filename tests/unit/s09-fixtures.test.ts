import { describe, expect, it } from "vitest";
import { canonical, decimal, samples, seeds } from "../support/s09-fixtures";
describe("S09 independent fixture integrity", () => {
  it("fixed expectations reconcile internally before they test any production query", () => {
    for (const row of canonical) {
      const [
        bank,
        cash,
        other,
        card,
        fd,
        loan,
        assets,
        liabilities,
        net,
        expense,
        income,
      ] = row.map(BigInt) as [
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
        bigint,
      ];
      expect(bank + cash + other + fd).toBe(assets);
      expect(card + loan).toBe(liabilities);
      expect(assets - liabilities).toBe(net);
      expect(3300000n + income - expense).toBe(net);
    }
  });
  it.each(seeds)(
    "fixed seed %s reproduces bounded exact decimal inputs",
    (seed) => {
      const a = samples(seed, 100);
      expect(a).toEqual(samples(seed, 100));
      expect(new Set(a.map(String)).size).toBeGreaterThan(90);
      for (const value of a) {
        expect(value > 0n && value <= 90000n).toBe(true);
        const [whole, cents] = decimal(value).split(".");
        expect(BigInt(whole!) * 100n + BigInt(cents!)).toBe(value);
      }
      expect(samples(1n, 1)).toEqual([48272n]);
    },
  );
});
