export const CHART = {
  CASH: "ASSET",
  BANK: "ASSET",
  FIXED_DEPOSIT: "ASSET",
  INVESTMENT: "ASSET",
  RECEIVABLE: "ASSET",
  OTHER_ASSET: "ASSET",
  CREDIT_CARD: "LIABILITY",
  LOAN: "LIABILITY",
  OTHER_LIABILITY: "LIABILITY",
  INCOME: "INCOME",
  FX_GAIN: "INCOME",
  EXPENSE: "EXPENSE",
  FX_LOSS: "EXPENSE",
  ROUNDING: "EXPENSE",
  OPENING_EQUITY: "EQUITY",
  OTHER_EQUITY: "EQUITY",
} as const;
export type AccountKind = keyof typeof CHART;
export type AccountClass = (typeof CHART)[AccountKind];
export function normalSide(type: AccountClass): "DEBIT" | "CREDIT" {
  switch (type) {
    case "ASSET":
    case "EXPENSE":
      return "DEBIT";
    case "LIABILITY":
    case "INCOME":
    case "EQUITY":
      return "CREDIT";
    default:
      throw new Error("Unsupported account class");
  }
}
export function normalBalance(
  debitMinusCredit: bigint,
  type: AccountClass,
): bigint {
  return normalSide(type) === "DEBIT" ? debitMinusCredit : -debitMinusCredit;
}
