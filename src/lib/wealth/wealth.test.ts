import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accountKinds } from "../accounts/shared";
import {
  categories,
  categoryIds,
  defaultCategory,
  findCategory,
  sectionCategories,
} from "./catalog";
import { addTenure, depositMaturityEstimate, marketValue } from "./compute";
import { maskSecret, validateProfile } from "./contract";
import { existsSync, readFileSync } from "node:fs";
import { institutionApps, institutionDomains } from "./institution-domains";
import { generatedMark, institutions, matchInstitution } from "./institutions";
import logoManifest from "./logo-manifest.json";
import { openSecrets, sealSecrets, VaultUnavailable } from "./vault";

const fd = {
  category: "fixed-deposits",
  institution: "Suryoday Small Finance Bank",
  institutionKey: "suryoday-sfb",
  platform: "Stable Money",
  platformKey: "stable-money",
  fundingAccountId: "6f9c2a52-4c55-4f0e-9d2a-0d6c7b2f1a10",
  details: {
    interestRate: "8.1",
    startDate: "2026-06-10",
    tenureYears: "1",
    tenureMonths: "6",
    compounding: "quarterly",
    payout: "cumulative",
  },
  secrets: { depositNumber: "FD7788123400" },
  notes: "Booked on Stable Money",
  revision: null,
};

describe("Wealth catalog", () => {
  it("maps every category to a supported ledger kind and unique id", () => {
    expect(new Set(categoryIds).size).toBe(categories.length);
    for (const c of categories) {
      expect(accountKinds).toContain(c.ledgerKind);
      expect(new Set(c.fields.map((f) => f.key)).size).toBe(c.fields.length);
    }
  });
  it("covers liquid banking and market investments", () => {
    expect(sectionCategories("liquid").map((c) => c.id)).toEqual(
      expect.arrayContaining(["savings", "current", "fixed-deposits"]),
    );
    expect(sectionCategories("markets").map((c) => c.id)).toEqual(
      expect.arrayContaining(["mutual-funds", "stocks", "nsc", "bonds", "ppf"]),
    );
  });
  it("keeps the migration CHECK list in sync", async () => {
    const { readFileSync } = await import("node:fs");
    const sql = readFileSync(
      "prisma/migrations/202611160014_holding_profiles/migration.sql",
      "utf8",
    );
    for (const id of categoryIds) expect(sql).toContain(`'${id}'`);
  });
  it("defaults legacy accounts by kind", () => {
    expect(defaultCategory("BANK").id).toBe("savings");
    expect(defaultCategory("FIXED_DEPOSIT").id).toBe("fixed-deposits");
    expect(defaultCategory("LOAN").section).toBe("liabilities");
  });
});

describe("Holding profile contract", () => {
  it("accepts a full FD opened via a platform from a funding account", () => {
    const result = validateProfile(fd, "FIXED_DEPOSIT");
    expect(result.ok).toBe(true);
    if (result.ok)
      expect(result.value).toMatchObject({
        platformKey: "stable-money",
        secrets: { depositNumber: "FD7788123400" },
      });
  });
  it("accepts a sparse profile so details can be filled in later", () => {
    expect(
      validateProfile(
        {
          ...fd,
          details: {},
          secrets: undefined,
          platform: null,
          platformKey: null,
          notes: null,
        },
        "FIXED_DEPOSIT",
      ).ok,
    ).toBe(true);
  });
  it("rejects a category that does not match the ledger kind", () => {
    expect(validateProfile(fd, "BANK")).toEqual({
      ok: false,
      errors: { category: expect.any(String) },
    });
  });
  it.each([
    [{ details: { interestRate: "eight" } }, "interestRate"],
    [{ details: { startDate: "2026-02-30" } }, "startDate"],
    [{ details: { compounding: "daily" } }, "compounding"],
    [{ details: { depositNumber: "1234" } }, "depositNumber"],
    [{ details: { password: "x" } }, "password"],
    [{ secrets: { interestRate: "8" } }, "interestRate"],
    [{ institutionKey: "made-up" }, "institution"],
  ])("rejects invalid or misplaced fields %#", (patch, key) => {
    const result = validateProfile({ ...fd, ...patch }, "FIXED_DEPOSIT");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toHaveProperty(key);
  });
  it("validates bank identifiers and normalises IFSC", () => {
    const ok = validateProfile(
      {
        ...fd,
        category: "savings",
        platform: null,
        platformKey: null,
        fundingAccountId: null,
        details: { ifsc: "hdfc0001234" },
        secrets: {
          accountNumber: "50100234564567",
          netBankingUserId: "me.user",
        },
      },
      "BANK",
    );
    expect(ok.ok && ok.value.details.ifsc).toBe("HDFC0001234");
    const bad = validateProfile(
      {
        ...fd,
        category: "savings",
        platform: null,
        platformKey: null,
        fundingAccountId: null,
        details: { ifsc: "HDFC123" },
        secrets: {},
      },
      "BANK",
    );
    expect(bad.ok).toBe(false);
    // Savings accounts have no platform or funding source.
    expect(
      validateProfile(
        { ...fd, category: "savings", details: {}, secrets: {} },
        "BANK",
      ).ok,
    ).toBe(false);
  });
  it("rejects unknown top-level keys", () => {
    expect(
      validateProfile({ ...fd, ownerId: "forged" }, "FIXED_DEPOSIT").ok,
    ).toBe(false);
  });
  it("masks identifiers to their last four characters", () => {
    expect(maskSecret("5010 0234 5645 67")).toBe("•••• 4567");
    expect(maskSecret("123")).toBe("••••");
  });
});

describe("Display estimates", () => {
  it("adds tenures with month-end clamping", () => {
    expect(addTenure("2026-06-10", "1", "6")).toBe("2027-12-10");
    expect(addTenure("2026-01-31", "0", "1")).toBe("2026-02-28");
    expect(addTenure("2026-01-01", undefined, undefined, "45")).toBe(
      "2026-02-15",
    );
    expect(addTenure("2026-01-01")).toBeUndefined();
  });
  it("estimates quarterly-compounded cumulative maturity", () => {
    const e = depositMaturityEstimate(500000, fd.details)!;
    // 5,00,000 at 8.1% compounded quarterly for 548 days ≈ ₹5,63,972.
    expect(e.days).toBe(548);
    expect(e.maturity).toBeGreaterThan(563900);
    expect(e.maturity).toBeLessThan(564050);
    expect(e.interest).toBeCloseTo(e.maturity - 500000, 2);
  });
  it("returns periodic payouts for non-cumulative deposits", () => {
    const e = depositMaturityEstimate(500000, {
      ...fd.details,
      payout: "monthly",
    })!;
    expect(e.maturity).toBe(500000);
    expect(e.payoutPerPeriod).toBe(3375);
  });
  it("derives market value from quantity and price", () => {
    expect(marketValue({ units: "10", currentNav: "92.35" })).toBe(923.5);
    expect(marketValue({ quantity: "10", currentPrice: "4120" })).toBe(41200);
    expect(
      marketValue({ currentValue: "5000", units: "1", currentNav: "1" }),
    ).toBe(5000);
    expect(marketValue({})).toBeUndefined();
  });
});

describe("Institution marks", () => {
  it("recognises banks, apps and AMCs from free text", () => {
    expect(matchInstitution("hdfc")?.key).toBe("hdfc-bank");
    expect(matchInstitution("Stable Money app")?.key).toBe("stable-money");
    expect(matchInstitution("IDFC First Bank savings")?.key).toBe(
      "idfc-first-bank",
    );
    expect(matchInstitution("Suryoday")?.key).toBe("suryoday-sfb");
    expect(matchInstitution("Some local co-op")).toBeUndefined();
  });
  it("has unique keys and a deterministic fallback mark", () => {
    expect(new Set(institutions.map((i) => i.key)).size).toBe(
      institutions.length,
    );
    expect(generatedMark("Some local co-op")).toEqual(
      generatedMark("Some local co-op"),
    );
    expect(generatedMark("Some local co-op").mark).toBe("SL");
  });
});

describe("Official logos", () => {
  const manifest: Record<string, string> = logoManifest;
  it("has a source for every institution", () => {
    for (const i of institutions)
      expect(
        institutionDomains[i.key] ?? institutionApps[i.key],
        i.key,
      ).toBeTruthy();
  });
  it("maps only registry keys to existing verified raster files", () => {
    const keys = new Set(institutions.map((i) => i.key));
    expect(Object.keys(manifest).length).toBeGreaterThan(70);
    for (const [key, path] of Object.entries(manifest)) {
      expect(keys.has(key), key).toBe(true);
      expect(path).toMatch(
        new RegExp(`^/institutions/${key}\\.(png|jpg|webp|ico|gif)$`),
      );
      const file = "public" + path;
      expect(existsSync(file), file).toBe(true);
      const head = readFileSync(file).subarray(0, 4).toString("hex");
      expect(
        ["89504e47", "00000100", "47494638", "52494646"].includes(head) ||
          head.startsWith("ffd8ff"),
        file,
      ).toBe(true);
    }
  });
});

describe("Identifier vault", () => {
  const env = { LEDGERONE_VAULT_KEY: randomBytes(32).toString("base64") };
  it("round-trips and binds ciphertext to its owner and account", () => {
    const sealed = sealSecrets(
      { accountNumber: "123456789" },
      "owner",
      "acct",
      env,
    )!;
    expect(sealed).toMatch(/^v1\./);
    expect(sealed).not.toContain("123456789");
    expect(openSecrets(sealed, "owner", "acct", env)).toEqual({
      accountNumber: "123456789",
    });
    expect(() => openSecrets(sealed, "owner", "other", env)).toThrow(
      VaultUnavailable,
    );
    expect(() => openSecrets(sealed, "other", "acct", env)).toThrow(
      VaultUnavailable,
    );
  });
  it("fails closed without a valid key and stores nothing for empty sets", () => {
    expect(() => sealSecrets({ a: "1" }, "o", "a", {})).toThrow(
      VaultUnavailable,
    );
    expect(() =>
      sealSecrets({ a: "1" }, "o", "a", { LEDGERONE_VAULT_KEY: "short" }),
    ).toThrow(VaultUnavailable);
    expect(sealSecrets({}, "o", "a", {})).toBeNull();
    const other = { LEDGERONE_VAULT_KEY: randomBytes(32).toString("base64") };
    const sealed = sealSecrets({ a: "1" }, "o", "a", env)!;
    expect(() => openSecrets(sealed, "o", "a", other)).toThrow(
      VaultUnavailable,
    );
  });
});

it("every category resolves", () => {
  for (const id of categoryIds) expect(findCategory(id)?.id).toBe(id);
});
