// DTOs shared by the Wealth API and its client views.
export type Holding = {
  id: string;
  workspaceId: string;
  name: string;
  kind: string;
  type: "ASSET" | "LIABILITY";
  currencyCode: string;
  archived: boolean;
  /** Posted ledger balance in its normal sign (assets held / debt owed). */
  balanceMinor: string;
  openedAt: string;
  category: string;
  hasProfile: boolean;
  institution: string | null;
  institutionKey: string | null;
  platform: string | null;
  platformKey: string | null;
  fundingAccountId: string | null;
  fundingAccountName: string | null;
  details: Record<string, string>;
  /** Masked tails of encrypted identifiers ("•••• 4567"). */
  secretMasks: Record<string, string>;
  /** True when encrypted identifiers exist but the vault key is unavailable. */
  secretsLocked: boolean;
  notes: string | null;
  revision: number | null;
  updatedAt: string | null;
};

export type WealthOverview = {
  holdings: Holding[];
  workspaces: { id: string; name: string }[];
  vault: boolean;
  asOf: string;
};
