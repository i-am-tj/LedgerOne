import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { postHarness } from "../support/post-harness";

// Wealth holding profiles: DB-level guards that hold even if the API is bypassed.
let h: Awaited<ReturnType<typeof postHarness>>;
beforeAll(async () => {
  h = await postHarness();
}, 60000);
afterAll(async () => {
  await h?.cleanup();
});

async function account(
  owner: { id: string; workspace: string },
  kind: string,
  type = "ASSET",
) {
  const id = randomUUID();
  await h.admin.query(
    `INSERT INTO ledger_account(id,"workspaceId","ownerId",name,type,kind,"currencyCode","updatedAt")
     VALUES($1,$2,$3,$4,$5,$6,'INR',now())`,
    [id, owner.workspace, owner.id, `${kind} ${id.slice(0, 6)}`, type, kind],
  );
  return id;
}
function profile(
  owner: { id: string; workspace: string },
  accountId: string,
  category: string,
  extra: {
    funding?: string | null;
    details?: unknown;
    cipher?: string | null;
  } = {},
) {
  return h.admin.query(
    `INSERT INTO holding_profile("accountId","workspaceId","ownerId",category,"fundingAccountId",details,"secretCipher","updatedAt")
     VALUES($1,$2,$3,$4,$5,$6::jsonb,$7,now())`,
    [
      accountId,
      owner.workspace,
      owner.id,
      category,
      extra.funding ?? null,
      JSON.stringify(extra.details ?? {}),
      extra.cipher ?? null,
    ],
  );
}

describe("holding_profile", () => {
  it("stores an FD profile funded from an owned bank account", async () => {
    const u = h.users[0]!;
    const bank = await account(u, "BANK");
    const fd = await account(u, "FIXED_DEPOSIT");
    await profile(u, fd, "fixed-deposits", {
      funding: bank,
      details: { interestRate: "8.1", startDate: "2026-06-10" },
      cipher: "v1.a.b.c",
    });
    const row = await h.admin.query(
      `SELECT category,details,revision FROM holding_profile WHERE "accountId"=$1`,
      [fd],
    );
    expect(row.rows[0]).toMatchObject({
      category: "fixed-deposits",
      revision: 1,
      details: { interestRate: "8.1" },
    });
  });
  it("rejects a category that does not describe the account kind", async () => {
    const u = h.users[0]!;
    const bank = await account(u, "BANK");
    await expect(profile(u, bank, "fixed-deposits")).rejects.toThrow(
      /does not match account kind/,
    );
    await expect(profile(u, bank, "crypto")).rejects.toThrow();
  });
  it("rejects funding from non-cash accounts, itself or another owner", async () => {
    const [u, other] = [h.users[0]!, h.users[1]!];
    const loan = await account(u, "LOAN", "LIABILITY");
    const mf = await account(u, "INVESTMENT");
    await expect(
      profile(u, mf, "mutual-funds", { funding: loan }),
    ).rejects.toThrow(/Funding account must be/);
    await expect(
      profile(u, mf, "mutual-funds", { funding: mf }),
    ).rejects.toThrow();
    const foreign = await account(other, "BANK");
    await expect(
      profile(u, mf, "mutual-funds", { funding: foreign }),
    ).rejects.toThrow();
  });
  it("cannot decorate another owner's account or move scope", async () => {
    const [u, other] = [h.users[0]!, h.users[1]!];
    const theirs = await account(other, "BANK");
    await expect(
      profile({ id: u.id, workspace: other.workspace }, theirs, "savings"),
    ).rejects.toThrow();
    const mine = await account(u, "BANK");
    await profile(u, mine, "savings");
    await expect(
      h.admin.query(
        `UPDATE holding_profile SET category='current' WHERE "accountId"=$1`,
        [mine],
      ),
    ).resolves.toBeTruthy();
    await expect(
      h.admin.query(
        `UPDATE holding_profile SET "ownerId"=$2,"workspaceId"=$3 WHERE "accountId"=$1`,
        [mine, other.id, other.workspace],
      ),
    ).rejects.toThrow();
  });
  it("enforces detail and cipher shapes", async () => {
    const u = h.users[0]!;
    const a = await account(u, "BANK");
    await expect(profile(u, a, "savings", { details: ["x"] })).rejects.toThrow(
      /details_shape/,
    );
    await expect(
      profile(u, a, "savings", { cipher: "plaintext-account-no" }),
    ).rejects.toThrow(/secret_shape/);
  });
  it("audits wealth actions only without ledger linkage", async () => {
    const u = h.users[0]!;
    await h.admin.query(
      `INSERT INTO audit_event(id,"ownerId","actorId","workspaceId","requestId",action) VALUES(gen_random_uuid(),$1,$1,$2,$3,'wealth.profile.updated')`,
      [u.id, u.workspace, randomUUID()],
    );
    await expect(
      h.admin.query(
        `INSERT INTO audit_event(id,"ownerId","actorId","workspaceId","requestId",action,reason) VALUES(gen_random_uuid(),$1,$1,$2,$3,'wealth.secrets.revealed','x')`,
        [u.id, u.workspace, randomUUID()],
      ),
    ).rejects.toThrow(/audit_event_action/);
    await expect(
      h.admin.query(
        `INSERT INTO audit_event(id,"ownerId","actorId","workspaceId","requestId",action) VALUES(gen_random_uuid(),$1,$1,$2,$3,'wealth.deleted')`,
        [u.id, u.workspace, randomUUID()],
      ),
    ).rejects.toThrow(/audit_event_action/);
  });
});
