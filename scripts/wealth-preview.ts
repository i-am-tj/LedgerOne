// Local Wealth preview: a write-enabled LedgerOne on a generated disposable
// `_test` database, signed in as a synthetic owner in a local browser.
// Never targets hosted databases; everything is dropped when it exits.
//
//   npm run preview:wealth                 # empty workspace, opens Chromium
//   npm run preview:wealth -- --seed       # with synthetic demo holdings
//   npm run preview:wealth -- --seed --capture docs/evidence/wealth
//
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac, randomBytes, randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { chromium, devices, type BrowserContext } from "@playwright/test";
import { loadProfile } from "./load-env";
import { withFreshLedgerDatabase } from "./lib/fresh-ledger-database";

loadProfile("test");
const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const port = Number(option("--port") ?? 3200);
const base = `http://127.0.0.1:${port}`;
const secret = randomBytes(48).toString("base64");
const email = "preview-owner@ledgerone.test";

async function waitFor(url: string, child: ChildProcess) {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw Error("Preview server exited early");
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw Error("Preview server did not start in time");
}

async function signIn(url: string) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    const user = await client.query<{ id: string }>(
      `INSERT INTO auth_user(id,email,"emailVerified",name,"createdAt","updatedAt")
       VALUES ($1,$2,true,'Preview owner',NOW(),NOW())
       ON CONFLICT (email) DO UPDATE SET "emailVerified"=true RETURNING id`,
      [randomUUID(), email],
    );
    const token = randomBytes(32).toString("hex");
    await client.query(
      `INSERT INTO auth_session(id,token,"userId","expiresAt","createdAt","updatedAt")
       VALUES ($1,$2,$3,NOW()+interval '8 hours',NOW(),NOW())`,
      [randomUUID(), token, user.rows[0]!.id],
    );
    const signature = createHmac("sha256", secret)
      .update(token)
      .digest("base64");
    return encodeURIComponent(`${token}.${signature}`);
  } finally {
    await client.end();
  }
}

function api(cookie: string) {
  return async <T = Record<string, string>>(
    path: string,
    method: "POST" | "PUT",
    body: unknown,
    idempotent = true,
  ): Promise<T> => {
    const response = await fetch(base + path, {
      method,
      headers: {
        cookie: `ledgerone.session_token=${cookie}`,
        origin: base,
        "content-type": "application/json",
        ...(idempotent ? { "idempotency-key": randomUUID() } : {}),
      },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw Error(
        `${method} ${path} → ${response.status} ${JSON.stringify(result)}`,
      );
    return result as T;
  };
}

/** Synthetic demo holdings that exercise every Wealth workflow. */
async function seed(cookie: string) {
  const call = api(cookie);
  const { id: ws } = await call<{ id: string }>(
    "/api/workspaces",
    "POST",
    { name: "Personal finances" },
    false,
  );
  const at = (d: string) => `${d}T00:00:00+05:30`;
  const create = async (
    name: string,
    accountKind: string,
    opening: string,
    date: string,
  ) =>
    (
      await call<{ accountId: string }>(
        `/api/accounts?workspace=${ws}`,
        "POST",
        {
          kind: "CREATE_ACCOUNT",
          name,
          accountKind,
          opening,
          effectiveAt: at(date),
        },
      )
    ).accountId;
  const profile = (id: string, body: Record<string, unknown>) =>
    call(
      `/api/wealth/holdings/${id}`,
      "PUT",
      {
        institution: null,
        institutionKey: null,
        platform: null,
        platformKey: null,
        fundingAccountId: null,
        details: {},
        notes: null,
        revision: null,
        ...body,
      },
      false,
    );

  const hdfc = await create(
    "HDFC Bank Savings",
    "BANK",
    "450000",
    "2026-04-01",
  );
  await profile(hdfc, {
    category: "savings",
    institution: "HDFC Bank",
    institutionKey: "hdfc-bank",
    details: {
      ifsc: "HDFC0001234",
      branch: "Koramangala",
      accountHolder: "Preview Owner",
      interestRate: "3",
      openedOn: "2019-07-12",
      upiId: "preview@hdfcbank",
    },
    secrets: {
      accountNumber: "50100234564567",
      customerId: "98765432",
      netBankingUserId: "preview.owner",
    },
  });
  const sbi = await create("SBI Current", "BANK", "125000", "2026-04-01");
  await profile(sbi, {
    category: "current",
    institution: "State Bank of India",
    institutionKey: "sbi",
    details: { ifsc: "SBIN0004321", openedOn: "2021-02-01" },
    secrets: { accountNumber: "38912348901" },
  });
  const idfc = await create(
    "IDFC FIRST Savings",
    "BANK",
    "900000",
    "2026-04-01",
  );
  await profile(idfc, {
    category: "savings",
    institution: "IDFC FIRST Bank",
    institutionKey: "idfc-first-bank",
    details: { interestRate: "3.5", openedOn: "2022-05-20" },
    secrets: { accountNumber: "10045678123" },
  });
  // FD opened via Stable Money from IDFC → Suryoday SFB: posts FD_FUNDING.
  const fd = await create(
    "Suryoday SFB FD",
    "FIXED_DEPOSIT",
    "0",
    "2026-06-10",
  );
  await call(`/api/transactions?workspace=${ws}`, "POST", {
    kind: "FD_FUNDING",
    sourceAccountId: idfc,
    destinationAccountId: fd,
    amount: "500000",
    effectiveAt: at("2026-06-10"),
    description: "Suryoday SFB FD via Stable Money",
  });
  await profile(fd, {
    category: "fixed-deposits",
    institution: "Suryoday Small Finance Bank",
    institutionKey: "suryoday-sfb",
    platform: "Stable Money",
    platformKey: "stable-money",
    fundingAccountId: idfc,
    details: {
      interestRate: "8.1",
      startDate: "2026-06-10",
      tenureYears: "1",
      tenureMonths: "6",
      compounding: "quarterly",
      payout: "cumulative",
      autoRenew: "no",
    },
    secrets: { depositNumber: "FD7788123400" },
    notes: "Booked on Stable Money; DICGC insured up to ₹5 lakh.",
  });
  const hdfcFd = await create(
    "HDFC FD - 1 Yr",
    "FIXED_DEPOSIT",
    "200000",
    "2025-08-15",
  );
  await profile(hdfcFd, {
    category: "fixed-deposits",
    institution: "HDFC Bank",
    institutionKey: "hdfc-bank",
    fundingAccountId: hdfc,
    details: {
      interestRate: "7.1",
      startDate: "2025-08-15",
      tenureYears: "1",
      tenureMonths: "6",
      compounding: "quarterly",
      payout: "cumulative",
    },
  });
  const mf = await create(
    "Parag Parikh Flexi Cap",
    "INVESTMENT",
    "150000",
    "2025-01-10",
  );
  await profile(mf, {
    category: "mutual-funds",
    institution: "PPFAS Mutual Fund",
    institutionKey: "ppfas-mf",
    platform: "Zerodha Coin",
    platformKey: "zerodha-coin",
    fundingAccountId: hdfc,
    details: {
      schemeName: "Parag Parikh Flexi Cap Fund",
      plan: "direct",
      option: "growth",
      fundCategory: "equity",
      units: "1820.512",
      currentNav: "92.35",
      sipAmount: "10000",
      sipDay: "5",
    },
    secrets: { folioNumber: "12345678/90" },
  });
  const stock = await create("TCS", "INVESTMENT", "38000", "2025-03-03");
  await profile(stock, {
    category: "stocks",
    institution: "Tata Consultancy Services",
    platform: "Zerodha",
    platformKey: "zerodha",
    details: {
      symbol: "TCS",
      exchange: "NSE",
      quantity: "10",
      averagePrice: "3800",
      currentPrice: "4120",
    },
  });
  const nsc = await create(
    "NSC VIII Issue",
    "INVESTMENT",
    "100000",
    "2024-11-01",
  );
  await profile(nsc, {
    category: "nsc",
    institution: "India Post",
    institutionKey: "india-post",
    details: {
      interestRate: "7.7",
      startDate: "2024-11-01",
      maturityDate: "2029-11-01",
      maturityAmount: "144903",
    },
  });
  const card = await create(
    "HDFC Regalia",
    "CREDIT_CARD",
    "18450",
    "2026-04-01",
  );
  await profile(card, {
    category: "credit-cards",
    institution: "HDFC Bank",
    institutionKey: "hdfc-bank",
    details: {
      cardLast4: "1234",
      network: "visa",
      creditLimit: "300000",
      statementDay: "12",
      dueDay: "2",
    },
  });
  return { fd };
}

async function capture(
  context: (mobile: boolean) => Promise<BrowserContext>,
  dir: string,
  fd: string,
) {
  mkdirSync(dir, { recursive: true });
  const shots: [string, string][] = [
    ["liquid", "/wealth/liquid"],
    ["markets", "/wealth/markets"],
    ["fixed-deposits", "/wealth/liquid/fixed-deposits"],
    ["fd-detail", `/wealth/liquid/fixed-deposits/${fd}`],
    ["fd-new", "/wealth/liquid/fixed-deposits/new"],
    ["savings-new", "/wealth/liquid/savings/new"],
  ];
  for (const mobile of [false, true]) {
    const ctx = await context(mobile);
    const page = await ctx.newPage();
    page.on(
      "console",
      (m) => m.type() === "error" && console.error("[browser]", m.text()),
    );
    page.on(
      "response",
      (r) =>
        r.url().includes("/api/") &&
        r.status() >= 400 &&
        console.error("[api]", r.status(), r.url()),
    );
    for (const [name, path] of shots) {
      await page.goto(base + path, {
        waitUntil: "domcontentloaded",
        timeout: 180_000,
      });
      await page.locator("main h1").first().waitFor({ timeout: 120_000 });
      await page
        .locator('main [role="status"]', { hasText: /Loading/ })
        .waitFor({ state: "detached", timeout: 60_000 })
        .catch(() => {});
      if (name === "fd-new") {
        // The example from the request: ₹5L via Stable Money from IDFC FIRST
        // to Suryoday SFB at 8.1% for 1y 6m, paid from the bank account.
        await page
          .getByLabel("Deposit bank", { exact: true })
          .fill("Suryoday Small Finance Bank");
        await page
          .getByLabel("Booked via (app / platform)")
          .fill("Stable Money");
        await page
          .getByLabel("Funded from")
          .selectOption({ label: "IDFC FIRST Savings" });
        await page.getByText("Paid from one of my accounts").click();
        await page.getByLabel("Principal (₹)").fill("5,00,000");
        await page.getByLabel("Start date", { exact: true }).fill("2026-06-10");
        await page.getByLabel("Interest rate (% p.a.)").fill("8.1");
        await page.getByLabel("Tenure — years").fill("1");
        await page.getByLabel("Tenure — months").fill("6");
        await page.getByLabel("Compounding").selectOption("quarterly");
        await page.getByLabel("Interest payout").selectOption("cumulative");
      }
      // Fixed tab bar / sticky save bar would float mid-image in full-page shots.
      await page.addStyleTag({
        content:
          ".app-header,.primary-tabbar,.sticky-actions{position:static!important}",
      });
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(400);
      console.log("captured", name, mobile ? "mobile" : "desktop");
      await page.screenshot({
        path: join(dir, `${name}-${mobile ? "mobile" : "desktop"}.png`),
        fullPage: true,
        animations: "disabled",
      });
    }
    await ctx.close();
  }
}

async function main() {
  try {
    await fetch(base + "/api/health/live");
    throw Error(
      `Port ${port} is already in use; stop that server or pass --port`,
    );
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Port")) throw error;
  }
  await withFreshLedgerDatabase(process.env.TEST_DATABASE_URL!, async (url) => {
    const child = spawn(
      process.execPath,
      [
        "node_modules/.bin/tsx",
        "scripts/account-app-server.ts",
        ...(flag("--prod") ? [] : ["--dev"]),
      ],
      {
        stdio: ["ignore", flag("--quiet") ? "ignore" : "inherit", "inherit"],
        detached: true,
        env: {
          ...process.env,
          LEDGERONE_ENV: "test",
          DATABASE_URL: url,
          DIRECT_DATABASE_URL: url,
          TEST_DATABASE_URL: url,
          PORT: String(port),
          BETTER_AUTH_URL: base,
          BETTER_AUTH_SECRET: secret,
          GOOGLE_CLIENT_ID: "preview-google-placeholder",
          GOOGLE_CLIENT_SECRET: "preview-google-placeholder",
          GITHUB_CLIENT_ID: "preview-github-placeholder",
          GITHUB_CLIENT_SECRET: "preview-github-placeholder",
          AUTH_ALLOWED_EMAILS: email,
          LEDGERONE_VAULT_KEY:
            process.env.LEDGERONE_VAULT_KEY ??
            randomBytes(32).toString("base64"),
          NEXT_TELEMETRY_DISABLED: "1",
        },
      },
    );
    // Signal the whole group so the Next server never outlives the preview,
    // including when the preview is interrupted before it is ready.
    const signal = (name: NodeJS.Signals) => {
      try {
        process.kill(-child.pid!, name);
      } catch {
        child.kill(name);
      }
    };
    const stop = () => signal("SIGTERM");
    let interrupted: () => void = () => {};
    const interrupt = new Promise<void>((resolve) => (interrupted = resolve));
    const onSignal = () => interrupted();
    process.on("SIGINT", onSignal);
    process.on("SIGTERM", onSignal);
    process.on("SIGHUP", onSignal);
    process.once("exit", () => signal("SIGKILL"));
    try {
      await Promise.race([
        waitFor(base + "/api/health/live", child),
        interrupt.then(() => {
          throw Error("Interrupted before the preview was ready");
        }),
      ]);
      const cookie = await signIn(url);
      const seeded = flag("--seed") ? await seed(cookie) : undefined;
      const browser = await chromium.launch({
        headless: !!option("--capture"),
      });
      const context = async (mobile: boolean) => {
        const ctx = await browser.newContext(
          mobile
            ? { ...devices["Pixel 7"] }
            : { viewport: { width: 1440, height: 1000 } },
        );
        await ctx.addCookies([
          {
            name: "ledgerone.session_token",
            value: cookie,
            url: base,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        return ctx;
      };
      if (option("--capture")) {
        if (!seeded) throw Error("--capture requires --seed");
        try {
          await capture(context, option("--capture")!, seeded.fd);
        } catch (error) {
          console.error(
            "Capture failed:",
            error instanceof Error ? error.message : error,
          );
          throw error;
        } finally {
          await browser.close();
        }
        return;
      }
      const page = await (await context(flag("--mobile"))).newPage();
      await page.goto(base + "/wealth/liquid");
      console.log(
        `\nWealth preview ready at ${base}/wealth/liquid (signed in as ${email}).`,
      );
      console.log(
        "Close the browser window or press Ctrl+C to stop. The database is discarded on exit.\n",
      );
      // On macOS closing the last window leaves Chromium running, so the
      // page/context closing ends the preview too.
      await Promise.race([
        interrupt,
        new Promise<void>((resolve) => {
          browser.on("disconnected", () => resolve());
          page.on("close", () => resolve());
          page.context().on("close", () => resolve());
        }),
      ]);
      await browser.close().catch(() => {});
    } finally {
      stop();
      const escalate = setTimeout(() => signal("SIGKILL"), 10_000);
      await new Promise((r) =>
        child.exitCode !== null ? r(null) : child.once("exit", r),
      );
      clearTimeout(escalate);
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
      process.off("SIGHUP", onSignal);
    }
  });
}
main().catch((error) => {
  if (process.env.PREVIEW_DEBUG) console.error(error);
  console.error(
    "Wealth preview failed:",
    error instanceof Error ? error.message : error,
  );
  process.exitCode = 1;
});
