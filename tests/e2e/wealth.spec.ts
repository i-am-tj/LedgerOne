import AxeBuilder from "@axe-core/playwright";
import { test as base, expect } from "./fixtures";

// Each browser project gets its own synthetic owner so totals are deterministic.
const test = base.extend({
  ownerEmail: async ({ baseURL }, use, info) => {
    if (baseURL !== "http://127.0.0.1:3100")
      throw Error("Isolated local wealth session required");
    await use(
      info.project.name === "desktop-chromium"
        ? "e2e-wealth-desktop@ledgerone.test"
        : "e2e-wealth-mobile@ledgerone.test",
    );
  },
});

const axe = (page: import("@playwright/test").Page) =>
  new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();

test("Wealth: bank account with identifiers, FD funded via platform, edit, archive", async ({
  page,
  isMobile,
}, info) => {
  // Level 1 → 2 → 3 navigation
  await page.goto("/wealth");
  await expect(page).toHaveURL(/\/wealth\/liquid$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Liquid" }),
  ).toBeVisible();
  const primary = page
    .getByRole("navigation", { name: "Primary navigation" })
    .filter({ visible: true });
  await expect(primary.getByRole("link", { name: "Wealth" })).toHaveAttribute(
    "aria-current",
    "true",
  );
  const secondary = page
    .getByRole("navigation", {
      name: isMobile ? "Section navigation" : "Main navigation",
    })
    .filter({ visible: true });
  await expect(
    secondary.getByRole("link", { name: "Markets", exact: true }),
  ).toBeVisible();
  await expect(
    secondary.getByRole("link", { name: "Fixed deposits" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Nothing in Liquid yet" }),
  ).toBeVisible();
  expect((await axe(page)).violations).toEqual([]);

  // Savings account: opening balance + encrypted identifiers
  await page
    .getByRole("link", { name: "Savings account", exact: true })
    .click();
  await expect(page).toHaveURL(/\/wealth\/liquid\/savings\/new$/);
  // Bank suggestions are limited to banks (no fund houses or apps).
  await page.getByLabel("Bank", { exact: true }).fill("HDFC");
  const suggestions = page.getByRole("listbox");
  await expect(
    suggestions.getByRole("option", { name: /HDFC Bank/ }),
  ).toBeVisible();
  await expect(
    suggestions.getByRole("option", { name: /Mutual Fund/ }),
  ).toHaveCount(0);
  await expect(
    suggestions.getByRole("option", { name: /Securities/ }),
  ).toHaveCount(0);
  await page.getByLabel("Bank", { exact: true }).fill("IDFC First Bank");
  await expect(page.getByText("Recognised: IDFC FIRST Bank")).toBeVisible();
  await page.getByLabel("Opening balance (₹)").fill("9,00,000");
  await page.getByLabel("Opening date").fill("2026-04-01");
  await page.getByLabel("Account number").fill("10045678123");
  await page.getByLabel("IFSC").fill("idfb0040101");
  await page.getByLabel("Net banking user ID").fill("e2e.user");
  expect((await axe(page)).violations).toEqual([]);
  await page.getByRole("button", { name: "Add savings account" }).click();
  await expect(page).toHaveURL(
    /\/wealth\/liquid\/savings\/[0-9a-f-]+\?created=1$/,
  );
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "IDFC FIRST Bank Savings account",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("₹9,00,000", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("•••• 8123")).toBeVisible();
  await expect(page.getByText("IDFB0040101")).toBeVisible();
  expect(await page.locator("main").innerText()).not.toContain("10045678123");
  await page.getByRole("button", { name: "Reveal" }).first().click();
  await expect(page.getByText("10045678123")).toBeVisible();

  // FD opened via Stable Money from the bank → Suryoday SFB (posts FD_FUNDING)
  await page.goto("/wealth/liquid/fixed-deposits/new");
  await page
    .getByLabel("Deposit bank", { exact: true })
    .fill("Suryoday Small Finance Bank");
  await page.getByLabel("Booked via (app / platform)").fill("Stable Money");
  await expect(page.getByText("Recognised: Stable Money")).toBeVisible();
  // Custom account picker: keyboard opens it, options show logo + balance.
  const funding = page.getByLabel("Funded from");
  await funding.focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("listbox")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await funding.click();
  const idfc = page.getByRole("option", {
    name: /IDFC FIRST Bank Savings account/,
  });
  await expect(idfc).toContainText("₹9,00,000");
  await idfc.click();
  await expect(funding).toContainText("IDFC FIRST Bank Savings account");
  await page.getByText("Paid from one of my accounts").click();
  await page.getByLabel("Principal (₹)").fill("5,00,000");
  await page.getByLabel("Start date", { exact: true }).fill("2026-06-10");
  await page.getByLabel("Interest rate (% p.a.)").fill("eight");
  await page.getByRole("button", { name: "Add fixed deposit" }).click();
  await expect(
    page.getByText("Enter a rate like 7.1 (0–99.99)."),
  ).toBeVisible();
  await page.getByLabel("Interest rate (% p.a.)").fill("8.1");
  await page.getByLabel("Tenure — years").fill("1");
  await page.getByLabel("Tenure — months").fill("6");
  await page.getByLabel("Compounding").selectOption("quarterly");
  await page.getByLabel("Interest payout").selectOption("cumulative");
  await expect(page.getByText("Matures on 10 Dec 2027")).toBeVisible();
  await expect(page.getByText("Estimated maturity ₹5,63,972")).toBeVisible();
  await page.getByLabel("FD / receipt number").fill("FD7788123400");
  await page.screenshot({
    path: info.outputPath("wealth-fd-form.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Add fixed deposit" }).click();
  await expect(page).toHaveURL(
    /\/wealth\/liquid\/fixed-deposits\/[0-9a-f-]+\?created=1$/,
  );
  const fdId = new URL(page.url()).pathname.split("/").pop()!;
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Suryoday Small Finance Bank Fixed deposit",
    }),
  ).toBeVisible();
  await expect(
    page.getByText(
      /Funded from:\s*IDFC FIRST Bank Savings account via Stable Money to Suryoday Small Finance Bank/,
    ),
  ).toBeVisible();
  await expect(
    page
      .getByText("Matures 10 Dec 2027")
      .or(page.getByText("10 Dec 2027"))
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Ledger history/ }),
  ).toHaveAttribute("href", `/accounts/${fdId}`);

  // The ledger moved ₹5L from the bank into the FD; net worth unchanged.
  await page.goto("/wealth/liquid");
  await expect(
    page.getByText("₹9,00,000", { exact: true }).first(),
  ).toBeVisible();
  const bank = page.locator(".holding-card", {
    hasText: "IDFC FIRST Bank Savings account",
  });
  await expect(bank).toContainText("₹4,00,000");
  const fd = page.locator(".holding-row", {
    hasText: "Suryoday Small Finance Bank Fixed deposit",
  });
  await expect(fd).toContainText("₹5,00,000");
  await expect(fd).toContainText("8.1% p.a.");
  expect((await axe(page)).violations).toEqual([]);
  await page.screenshot({
    path: info.outputPath("wealth-liquid.png"),
    fullPage: true,
  });

  // Update later: details stay editable
  await fd.click();
  await page.getByRole("link", { name: "Edit details" }).click();
  await expect(page).toHaveURL(new RegExp(`/${fdId}/edit$`));
  await expect(page.getByLabel("FD / receipt number")).toHaveAttribute(
    "placeholder",
    "•••• 3400 — leave blank to keep",
  );
  await page.getByLabel("Interest rate (% p.a.)").fill("8.25");
  await page.getByLabel("Nominee").fill("Synthetic nominee");
  await page.getByLabel("Notes").fill("Renew on Stable Money if rates hold.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page).toHaveURL(/\?saved=1$/);
  await expect(page.getByText("Details saved.")).toBeVisible();
  await expect(page.getByText("8.25% p.a.").first()).toBeVisible();
  await expect(page.getByText("Synthetic nominee")).toBeVisible();
  await expect(page.getByText("•••• 3400")).toBeVisible();

  // Archive (soft delete) and restore
  await page.getByRole("button", { name: "Archive" }).click();
  await page.getByRole("button", { name: "Confirm archive" }).click();
  await expect(page.getByText("Archived. Its history is kept.")).toBeVisible();
  await page.getByRole("button", { name: "Restore" }).click();
  await expect(page.getByText("Restored.")).toBeVisible();

  // Markets has its own typed views
  await page.goto("/wealth/markets/mutual-funds/new");
  await expect(
    page.getByRole("heading", { level: 1, name: "Add mutual fund" }),
  ).toBeVisible();
  await expect(page.getByLabel("Folio number")).toBeVisible();
  await expect(page.getByLabel("Units held")).toBeVisible();
  await page.goto("/wealth/markets/not-a-type");
  await expect(
    page.getByRole("heading", { name: "This page isn’t here." }),
  ).toBeVisible();
});

test("Wealth API rejects cross-site writes and mismatched categories", async ({
  page,
}) => {
  await page.goto("/wealth/liquid");
  const overview = await page.request.get("/api/wealth");
  expect(overview.status()).toBe(200);
  const id = "00000000-0000-4000-8000-000000000000";
  const body = {
    category: "savings",
    institution: null,
    institutionKey: null,
    platform: null,
    platformKey: null,
    fundingAccountId: null,
    details: {},
    notes: null,
    revision: null,
  };
  expect(
    (
      await page.request.put(`/api/wealth/holdings/${id}`, {
        headers: { origin: "https://evil.example" },
        data: body,
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await page.request.put(`/api/wealth/holdings/${id}`, {
        headers: { origin: "http://127.0.0.1:3100" },
        data: body,
      })
    ).status(),
  ).toBe(404);
  expect(
    (await page.request.get(`/api/wealth/holdings/${id}?reveal=1`)).status(),
  ).toBe(404);
});
