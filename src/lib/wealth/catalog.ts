// Client-safe Wealth catalog: primary section → category → typed fields.
// The ledger stays the source of truth for balances; this catalog describes the
// descriptive profile each holding type can carry (bank, terms, identifiers…).
import type { accountKinds } from "../accounts/shared";

export type LedgerKind = (typeof accountKinds)[number];

export const sectionIds = [
  "liquid",
  "markets",
  "assets",
  "liabilities",
] as const;
export type SectionId = (typeof sectionIds)[number];

export type FieldType =
  "text" | "number" | "money" | "percent" | "date" | "select" | "textarea";

export type FieldDef = Readonly<{
  key: string;
  label: string;
  type: FieldType;
  /** Encrypted at rest and masked in lists; revealed only on request. */
  secret?: boolean;
  help?: string;
  placeholder?: string;
  options?: readonly { value: string; label: string }[];
  /** Regex applied after trimming (text/secret fields only). */
  pattern?: string;
  patternHint?: string;
  max?: number;
  group: "identity" | "terms" | "position" | "access" | "other";
}>;

export type CategoryDef = Readonly<{
  id: string;
  section: SectionId;
  label: string;
  singular: string;
  description: string;
  ledgerKind: LedgerKind;
  icon: string;
  institutionLabel: string;
  institutionHint: string;
  /** e.g. Stable Money, Zerodha, Groww. */
  platformLabel?: string;
  /** Account the money came from (stored on the profile). */
  fundingLabel?: string;
  /** FIXED_DEPOSIT kinds can post a real FD_FUNDING ledger movement. */
  ledgerFunding?: boolean;
  openingLabel: string;
  openingHelp: string;
  fields: readonly FieldDef[];
}>;

const yesNo = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;
const frequency = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "half-yearly", label: "Half-yearly" },
  { value: "yearly", label: "Yearly" },
] as const;

const bankAccess: FieldDef[] = [
  {
    key: "accountNumber",
    label: "Account number",
    type: "text",
    secret: true,
    pattern: "^[0-9A-Za-z -]{4,34}$",
    patternHint: "Use 4–34 letters, digits, spaces or hyphens.",
    group: "identity",
  },
  {
    key: "ifsc",
    label: "IFSC",
    type: "text",
    placeholder: "HDFC0001234",
    pattern: "^[A-Za-z]{4}0[A-Za-z0-9]{6}$",
    patternHint: "IFSC is 11 characters, like HDFC0001234.",
    group: "identity",
  },
  { key: "branch", label: "Branch", type: "text", max: 120, group: "identity" },
  {
    key: "accountHolder",
    label: "Account holder(s)",
    type: "text",
    max: 160,
    group: "identity",
  },
  {
    key: "customerId",
    label: "Customer / consumer ID",
    type: "text",
    secret: true,
    max: 64,
    group: "access",
  },
  {
    key: "netBankingUserId",
    label: "Net banking user ID",
    type: "text",
    secret: true,
    max: 64,
    help: "User ID only. LedgerOne never stores passwords, PINs or OTPs.",
    group: "access",
  },
  {
    key: "registeredMobile",
    label: "Registered mobile",
    type: "text",
    pattern: "^[0-9+ -]{6,20}$",
    patternHint: "Use digits, spaces, + or -.",
    group: "access",
  },
  {
    key: "upiId",
    label: "UPI ID",
    type: "text",
    max: 80,
    placeholder: "name@bank",
    group: "access",
  },
  {
    key: "debitCardLast4",
    label: "Debit card (last 4)",
    type: "text",
    pattern: "^[0-9]{4}$",
    patternHint: "Enter only the last 4 digits.",
    group: "access",
  },
  { key: "nominee", label: "Nominee", type: "text", max: 120, group: "other" },
  { key: "openedOn", label: "Opened on", type: "date", group: "other" },
];

const depositTerms: FieldDef[] = [
  {
    key: "interestRate",
    label: "Interest rate (% p.a.)",
    type: "percent",
    group: "terms",
  },
  { key: "startDate", label: "Start date", type: "date", group: "terms" },
  {
    key: "tenureYears",
    label: "Tenure — years",
    type: "number",
    group: "terms",
  },
  {
    key: "tenureMonths",
    label: "Tenure — months",
    type: "number",
    group: "terms",
  },
  {
    key: "tenureDays",
    label: "Tenure — days",
    type: "number",
    group: "terms",
  },
  {
    key: "maturityDate",
    label: "Maturity date",
    type: "date",
    help: "Calculated from start date and tenure; you can override it.",
    group: "terms",
  },
];

export const categories: readonly CategoryDef[] = [
  {
    id: "savings",
    section: "liquid",
    label: "Savings accounts",
    singular: "Savings account",
    description: "Everyday bank accounts that earn interest.",
    ledgerKind: "BANK",
    icon: "landmark",
    institutionLabel: "Bank",
    institutionHint: "HDFC Bank, IDFC FIRST Bank…",
    openingLabel: "Opening balance",
    openingHelp:
      "The balance on the opening date. Later statements can be reconciled against it.",
    fields: [
      ...bankAccess,
      {
        key: "interestRate",
        label: "Interest rate (% p.a.)",
        type: "percent",
        group: "terms",
      },
    ],
  },
  {
    id: "current",
    section: "liquid",
    label: "Current accounts",
    singular: "Current / checking account",
    description: "Checking and current accounts for frequent payments.",
    ledgerKind: "BANK",
    icon: "building",
    institutionLabel: "Bank",
    institutionHint: "SBI, ICICI Bank…",
    openingLabel: "Opening balance",
    openingHelp: "The balance on the opening date.",
    fields: [
      ...bankAccess,
      {
        key: "overdraftLimit",
        label: "Overdraft limit (₹)",
        type: "money",
        group: "terms",
      },
    ],
  },
  {
    id: "fixed-deposits",
    section: "liquid",
    label: "Fixed deposits",
    singular: "Fixed deposit",
    description: "Term deposits with a fixed rate and maturity.",
    ledgerKind: "FIXED_DEPOSIT",
    icon: "vault",
    institutionLabel: "Deposit bank",
    institutionHint: "Suryoday Small Finance Bank…",
    platformLabel: "Booked via (app / platform)",
    fundingLabel: "Funded from",
    ledgerFunding: true,
    openingLabel: "Principal",
    openingHelp: "Amount deposited when the FD was opened.",
    fields: [
      {
        key: "depositNumber",
        label: "FD / receipt number",
        type: "text",
        secret: true,
        max: 64,
        group: "identity",
      },
      ...depositTerms,
      {
        key: "compounding",
        label: "Compounding",
        type: "select",
        options: [...frequency, { value: "simple", label: "Simple interest" }],
        group: "terms",
      },
      {
        key: "payout",
        label: "Interest payout",
        type: "select",
        options: [
          { value: "cumulative", label: "Cumulative (at maturity)" },
          ...frequency,
        ],
        group: "terms",
      },
      {
        key: "maturityAmount",
        label: "Maturity amount (₹)",
        type: "money",
        help: "Leave blank to see an estimate.",
        group: "terms",
      },
      {
        key: "autoRenew",
        label: "Auto-renew",
        type: "select",
        options: yesNo,
        group: "terms",
      },
      {
        key: "taxSaver",
        label: "Tax-saver FD",
        type: "select",
        options: yesNo,
        group: "terms",
      },
      {
        key: "customerId",
        label: "Customer ID at deposit bank",
        type: "text",
        secret: true,
        max: 64,
        group: "access",
      },
      {
        key: "nominee",
        label: "Nominee",
        type: "text",
        max: 120,
        group: "other",
      },
    ],
  },
  {
    id: "recurring-deposits",
    section: "liquid",
    label: "Recurring deposits",
    singular: "Recurring deposit",
    description: "Monthly instalment deposits.",
    ledgerKind: "FIXED_DEPOSIT",
    icon: "repeat",
    institutionLabel: "Deposit bank",
    institutionHint: "India Post, SBI…",
    platformLabel: "Booked via (app / platform)",
    fundingLabel: "Instalments debited from",
    openingLabel: "Deposited so far",
    openingHelp: "Total instalments paid up to the opening date.",
    fields: [
      {
        key: "depositNumber",
        label: "RD account number",
        type: "text",
        secret: true,
        max: 64,
        group: "identity",
      },
      {
        key: "monthlyInstalment",
        label: "Monthly instalment (₹)",
        type: "money",
        group: "terms",
      },
      {
        key: "debitDay",
        label: "Debit day of month",
        type: "number",
        group: "terms",
      },
      ...depositTerms,
      {
        key: "maturityAmount",
        label: "Maturity amount (₹)",
        type: "money",
        group: "terms",
      },
    ],
  },
  {
    id: "cash",
    section: "liquid",
    label: "Cash",
    singular: "Cash wallet",
    description: "Physical cash and wallets.",
    ledgerKind: "CASH",
    icon: "wallet",
    institutionLabel: "Held at",
    institutionHint: "Home, travel wallet…",
    openingLabel: "Cash on hand",
    openingHelp: "Cash held on the opening date.",
    fields: [],
  },
  {
    id: "mutual-funds",
    section: "markets",
    label: "Mutual funds",
    singular: "Mutual fund",
    description: "Fund holdings by scheme and folio.",
    ledgerKind: "INVESTMENT",
    icon: "pie",
    institutionLabel: "Fund house (AMC)",
    institutionHint: "Parag Parikh, Mirae Asset…",
    platformLabel: "Invested via",
    fundingLabel: "Paid from",
    openingLabel: "Amount invested",
    openingHelp: "Your cost (invested amount) on the opening date.",
    fields: [
      {
        key: "schemeName",
        label: "Scheme",
        type: "text",
        max: 160,
        group: "identity",
      },
      {
        key: "folioNumber",
        label: "Folio number",
        type: "text",
        secret: true,
        max: 40,
        group: "identity",
      },
      {
        key: "plan",
        label: "Plan",
        type: "select",
        options: [
          { value: "direct", label: "Direct" },
          { value: "regular", label: "Regular" },
        ],
        group: "identity",
      },
      {
        key: "option",
        label: "Option",
        type: "select",
        options: [
          { value: "growth", label: "Growth" },
          { value: "idcw", label: "IDCW (dividend)" },
        ],
        group: "identity",
      },
      {
        key: "fundCategory",
        label: "Fund category",
        type: "select",
        options: [
          { value: "equity", label: "Equity" },
          { value: "elss", label: "ELSS (tax saver)" },
          { value: "index", label: "Index / ETF" },
          { value: "hybrid", label: "Hybrid" },
          { value: "debt", label: "Debt" },
          { value: "liquid", label: "Liquid" },
          { value: "other", label: "Other" },
        ],
        group: "identity",
      },
      {
        key: "isin",
        label: "ISIN",
        type: "text",
        pattern: "^[A-Za-z]{2}[A-Za-z0-9]{10}$",
        patternHint: "ISIN is 12 characters, like INF879O01027.",
        group: "identity",
      },
      { key: "units", label: "Units held", type: "number", group: "position" },
      {
        key: "averageNav",
        label: "Average NAV (₹)",
        type: "money",
        group: "position",
      },
      {
        key: "currentNav",
        label: "Current NAV (₹)",
        type: "money",
        group: "position",
      },
      {
        key: "currentValue",
        label: "Current value (₹)",
        type: "money",
        help: "Leave blank to use units × current NAV.",
        group: "position",
      },
      {
        key: "sipAmount",
        label: "SIP amount (₹)",
        type: "money",
        group: "terms",
      },
      {
        key: "sipDay",
        label: "SIP day of month",
        type: "number",
        group: "terms",
      },
    ],
  },
  {
    id: "stocks",
    section: "markets",
    label: "Stocks",
    singular: "Stock holding",
    description: "Equity shares held in your demat account.",
    ledgerKind: "INVESTMENT",
    icon: "trending",
    institutionLabel: "Company / issuer",
    institutionHint: "Tata Consultancy Services…",
    platformLabel: "Broker",
    fundingLabel: "Paid from",
    openingLabel: "Amount invested",
    openingHelp: "Your cost (quantity × average price) on the opening date.",
    fields: [
      {
        key: "symbol",
        label: "Symbol",
        type: "text",
        max: 24,
        placeholder: "TCS",
        group: "identity",
      },
      {
        key: "exchange",
        label: "Exchange",
        type: "select",
        options: [
          { value: "NSE", label: "NSE" },
          { value: "BSE", label: "BSE" },
          { value: "NASDAQ", label: "NASDAQ" },
          { value: "NYSE", label: "NYSE" },
          { value: "other", label: "Other" },
        ],
        group: "identity",
      },
      {
        key: "isin",
        label: "ISIN",
        type: "text",
        pattern: "^[A-Za-z]{2}[A-Za-z0-9]{10}$",
        patternHint: "ISIN is 12 characters.",
        group: "identity",
      },
      { key: "quantity", label: "Quantity", type: "number", group: "position" },
      {
        key: "averagePrice",
        label: "Average price (₹)",
        type: "money",
        group: "position",
      },
      {
        key: "currentPrice",
        label: "Current price (₹)",
        type: "money",
        group: "position",
      },
      {
        key: "currentValue",
        label: "Current value (₹)",
        type: "money",
        help: "Leave blank to use quantity × current price.",
        group: "position",
      },
      {
        key: "dematId",
        label: "Demat / BO ID",
        type: "text",
        secret: true,
        max: 32,
        group: "access",
      },
      {
        key: "clientId",
        label: "Broker client ID",
        type: "text",
        secret: true,
        max: 32,
        group: "access",
      },
    ],
  },
  {
    id: "bonds",
    section: "markets",
    label: "Bonds",
    singular: "Bond",
    description: "Government, corporate and gold bonds.",
    ledgerKind: "INVESTMENT",
    icon: "scroll",
    institutionLabel: "Issuer",
    institutionHint: "Government of India, REC Ltd…",
    platformLabel: "Bought via",
    fundingLabel: "Paid from",
    openingLabel: "Amount invested",
    openingHelp: "Purchase cost on the opening date.",
    fields: [
      {
        key: "bondType",
        label: "Bond type",
        type: "select",
        options: [
          { value: "government", label: "Government security" },
          { value: "sgb", label: "Sovereign gold bond" },
          { value: "corporate", label: "Corporate bond" },
          { value: "tax-free", label: "Tax-free bond" },
          { value: "54ec", label: "54EC capital gains bond" },
          { value: "other", label: "Other" },
        ],
        group: "identity",
      },
      {
        key: "isin",
        label: "ISIN",
        type: "text",
        pattern: "^[A-Za-z]{2}[A-Za-z0-9]{10}$",
        patternHint: "ISIN is 12 characters.",
        group: "identity",
      },
      {
        key: "creditRating",
        label: "Credit rating",
        type: "text",
        max: 16,
        group: "identity",
      },
      {
        key: "couponRate",
        label: "Coupon rate (% p.a.)",
        type: "percent",
        group: "terms",
      },
      {
        key: "couponFrequency",
        label: "Coupon frequency",
        type: "select",
        options: [...frequency, { value: "maturity", label: "At maturity" }],
        group: "terms",
      },
      {
        key: "faceValue",
        label: "Face value per unit (₹)",
        type: "money",
        group: "terms",
      },
      { key: "units", label: "Units", type: "number", group: "position" },
      {
        key: "purchaseDate",
        label: "Purchase date",
        type: "date",
        group: "terms",
      },
      {
        key: "maturityDate",
        label: "Maturity date",
        type: "date",
        group: "terms",
      },
      {
        key: "currentValue",
        label: "Current value (₹)",
        type: "money",
        group: "position",
      },
    ],
  },
  {
    id: "nsc",
    section: "markets",
    label: "NSC",
    singular: "National Savings Certificate",
    description: "Post office savings certificates.",
    ledgerKind: "INVESTMENT",
    icon: "stamp",
    institutionLabel: "Post office",
    institutionHint: "India Post, head post office…",
    fundingLabel: "Paid from",
    openingLabel: "Amount invested",
    openingHelp: "Certificate purchase amount.",
    fields: [
      {
        key: "certificateNumber",
        label: "Certificate number",
        type: "text",
        secret: true,
        max: 40,
        group: "identity",
      },
      {
        key: "holder",
        label: "Holder(s)",
        type: "text",
        max: 160,
        group: "identity",
      },
      {
        key: "interestRate",
        label: "Interest rate (% p.a.)",
        type: "percent",
        group: "terms",
      },
      {
        key: "startDate",
        label: "Purchase date",
        type: "date",
        group: "terms",
      },
      {
        key: "maturityDate",
        label: "Maturity date",
        type: "date",
        help: "NSC matures 5 years after purchase.",
        group: "terms",
      },
      {
        key: "maturityAmount",
        label: "Maturity amount (₹)",
        type: "money",
        group: "terms",
      },
      {
        key: "nominee",
        label: "Nominee",
        type: "text",
        max: 120,
        group: "other",
      },
    ],
  },
  {
    id: "ppf",
    section: "markets",
    label: "PPF",
    singular: "Public Provident Fund",
    description: "15-year government savings scheme.",
    ledgerKind: "INVESTMENT",
    icon: "shield",
    institutionLabel: "Bank / post office",
    institutionHint: "SBI, India Post…",
    fundingLabel: "Contributions from",
    openingLabel: "Balance",
    openingHelp: "PPF balance on the opening date.",
    fields: [
      {
        key: "accountNumber",
        label: "PPF account number",
        type: "text",
        secret: true,
        max: 34,
        group: "identity",
      },
      { key: "openedOn", label: "Opened on", type: "date", group: "terms" },
      {
        key: "maturityDate",
        label: "Maturity date",
        type: "date",
        group: "terms",
      },
      {
        key: "interestRate",
        label: "Interest rate (% p.a.)",
        type: "percent",
        group: "terms",
      },
      {
        key: "yearlyContribution",
        label: "Planned yearly contribution (₹)",
        type: "money",
        group: "terms",
      },
      {
        key: "nominee",
        label: "Nominee",
        type: "text",
        max: 120,
        group: "other",
      },
    ],
  },
  {
    id: "nps",
    section: "markets",
    label: "NPS",
    singular: "National Pension System",
    description: "Retirement pension accounts.",
    ledgerKind: "INVESTMENT",
    icon: "umbrella",
    institutionLabel: "Pension fund manager",
    institutionHint: "SBI Pension Funds…",
    platformLabel: "Managed via",
    fundingLabel: "Contributions from",
    openingLabel: "Amount invested",
    openingHelp: "Total contributions on the opening date.",
    fields: [
      {
        key: "pran",
        label: "PRAN",
        type: "text",
        secret: true,
        pattern: "^[0-9]{12}$",
        patternHint: "PRAN is 12 digits.",
        group: "identity",
      },
      {
        key: "tier",
        label: "Tier",
        type: "select",
        options: [
          { value: "tier-1", label: "Tier I" },
          { value: "tier-2", label: "Tier II" },
        ],
        group: "identity",
      },
      {
        key: "currentValue",
        label: "Current value (₹)",
        type: "money",
        group: "position",
      },
    ],
  },
  {
    id: "gold",
    section: "markets",
    label: "Gold",
    singular: "Gold holding",
    description: "Digital, physical and ETF gold.",
    ledgerKind: "INVESTMENT",
    icon: "gem",
    institutionLabel: "Provider",
    institutionHint: "MMTC-PAMP, jeweller…",
    platformLabel: "Bought via",
    fundingLabel: "Paid from",
    openingLabel: "Amount invested",
    openingHelp: "Purchase cost on the opening date.",
    fields: [
      {
        key: "goldForm",
        label: "Form",
        type: "select",
        options: [
          { value: "digital", label: "Digital gold" },
          { value: "physical", label: "Physical (coins, jewellery)" },
          { value: "etf", label: "Gold ETF / fund" },
        ],
        group: "identity",
      },
      {
        key: "grams",
        label: "Quantity (grams)",
        type: "number",
        group: "position",
      },
      {
        key: "currentValue",
        label: "Current value (₹)",
        type: "money",
        group: "position",
      },
    ],
  },
  {
    id: "other-investments",
    section: "markets",
    label: "Other investments",
    singular: "Investment",
    description: "Anything else you invest in.",
    ledgerKind: "INVESTMENT",
    icon: "sparkles",
    institutionLabel: "Provider",
    institutionHint: "Platform or issuer",
    platformLabel: "Invested via",
    fundingLabel: "Paid from",
    openingLabel: "Amount invested",
    openingHelp: "Cost on the opening date.",
    fields: [
      {
        key: "currentValue",
        label: "Current value (₹)",
        type: "money",
        group: "position",
      },
    ],
  },
  {
    id: "property",
    section: "assets",
    label: "Property",
    singular: "Property",
    description: "Homes, land and other real estate.",
    ledgerKind: "OTHER_ASSET",
    icon: "home",
    institutionLabel: "Developer / seller",
    institutionHint: "Optional",
    openingLabel: "Purchase value",
    openingHelp: "Book value on the opening date.",
    fields: [
      {
        key: "address",
        label: "Address",
        type: "textarea",
        max: 400,
        group: "identity",
      },
      {
        key: "registrationNumber",
        label: "Registration number",
        type: "text",
        secret: true,
        max: 64,
        group: "identity",
      },
      {
        key: "purchaseDate",
        label: "Purchase date",
        type: "date",
        group: "terms",
      },
      {
        key: "currentValue",
        label: "Estimated value (₹)",
        type: "money",
        group: "position",
      },
    ],
  },
  {
    id: "vehicles",
    section: "assets",
    label: "Vehicles",
    singular: "Vehicle",
    description: "Cars, bikes and other vehicles.",
    ledgerKind: "OTHER_ASSET",
    icon: "car",
    institutionLabel: "Make",
    institutionHint: "Maruti Suzuki, Honda…",
    openingLabel: "Purchase value",
    openingHelp: "Book value on the opening date.",
    fields: [
      {
        key: "model",
        label: "Model",
        type: "text",
        max: 80,
        group: "identity",
      },
      {
        key: "registration",
        label: "Registration number",
        type: "text",
        max: 20,
        group: "identity",
      },
      {
        key: "purchaseDate",
        label: "Purchase date",
        type: "date",
        group: "terms",
      },
      {
        key: "currentValue",
        label: "Estimated value (₹)",
        type: "money",
        group: "position",
      },
    ],
  },
  {
    id: "receivables",
    section: "assets",
    label: "Money owed to you",
    singular: "Receivable",
    description: "Loans you gave and deposits to get back.",
    ledgerKind: "RECEIVABLE",
    icon: "handshake",
    institutionLabel: "Owed by",
    institutionHint: "Person or organisation",
    openingLabel: "Amount owed to you",
    openingHelp: "Outstanding amount on the opening date.",
    fields: [
      { key: "dueDate", label: "Expected by", type: "date", group: "terms" },
    ],
  },
  {
    id: "other-assets",
    section: "assets",
    label: "Other assets",
    singular: "Asset",
    description: "Anything else you own.",
    ledgerKind: "OTHER_ASSET",
    icon: "box",
    institutionLabel: "Provider",
    institutionHint: "Optional",
    openingLabel: "Value",
    openingHelp: "Book value on the opening date.",
    fields: [
      {
        key: "currentValue",
        label: "Estimated value (₹)",
        type: "money",
        group: "position",
      },
    ],
  },
  {
    id: "credit-cards",
    section: "liabilities",
    label: "Credit cards",
    singular: "Credit card",
    description: "Card balances you owe.",
    ledgerKind: "CREDIT_CARD",
    icon: "card",
    institutionLabel: "Issuer",
    institutionHint: "HDFC Bank, American Express…",
    openingLabel: "Outstanding",
    openingHelp:
      "Amount owed on the opening date. Use a negative amount for a credit balance.",
    fields: [
      {
        key: "cardLast4",
        label: "Card (last 4)",
        type: "text",
        pattern: "^[0-9]{4}$",
        patternHint: "Enter only the last 4 digits.",
        group: "identity",
      },
      {
        key: "network",
        label: "Network",
        type: "select",
        options: [
          { value: "visa", label: "Visa" },
          { value: "mastercard", label: "Mastercard" },
          { value: "rupay", label: "RuPay" },
          { value: "amex", label: "American Express" },
          { value: "diners", label: "Diners Club" },
        ],
        group: "identity",
      },
      {
        key: "creditLimit",
        label: "Credit limit (₹)",
        type: "money",
        group: "terms",
      },
      {
        key: "statementDay",
        label: "Statement day",
        type: "number",
        group: "terms",
      },
      {
        key: "dueDay",
        label: "Payment due day",
        type: "number",
        group: "terms",
      },
      {
        key: "customerId",
        label: "Customer ID",
        type: "text",
        secret: true,
        max: 64,
        group: "access",
      },
    ],
  },
  {
    id: "loans",
    section: "liabilities",
    label: "Loans",
    singular: "Loan",
    description: "Home, car, personal and education loans.",
    ledgerKind: "LOAN",
    icon: "receipt",
    institutionLabel: "Lender",
    institutionHint: "SBI, Bajaj Finance…",
    fundingLabel: "EMI paid from",
    openingLabel: "Outstanding principal",
    openingHelp: "Principal owed on the opening date.",
    fields: [
      {
        key: "loanType",
        label: "Loan type",
        type: "select",
        options: [
          { value: "home", label: "Home" },
          { value: "car", label: "Vehicle" },
          { value: "personal", label: "Personal" },
          { value: "education", label: "Education" },
          { value: "gold", label: "Gold" },
          { value: "other", label: "Other" },
        ],
        group: "identity",
      },
      {
        key: "loanAccountNumber",
        label: "Loan account number",
        type: "text",
        secret: true,
        max: 40,
        group: "identity",
      },
      {
        key: "sanctionedAmount",
        label: "Sanctioned amount (₹)",
        type: "money",
        group: "terms",
      },
      {
        key: "interestRate",
        label: "Interest rate (% p.a.)",
        type: "percent",
        group: "terms",
      },
      { key: "emi", label: "EMI (₹)", type: "money", group: "terms" },
      {
        key: "emiDay",
        label: "EMI day of month",
        type: "number",
        group: "terms",
      },
      { key: "startDate", label: "Start date", type: "date", group: "terms" },
      { key: "endDate", label: "End date", type: "date", group: "terms" },
    ],
  },
  {
    id: "other-liabilities",
    section: "liabilities",
    label: "Other liabilities",
    singular: "Liability",
    description: "Anything else you owe.",
    ledgerKind: "OTHER_LIABILITY",
    icon: "scale",
    institutionLabel: "Owed to",
    institutionHint: "Person or organisation",
    openingLabel: "Outstanding",
    openingHelp: "Amount owed on the opening date.",
    fields: [{ key: "dueDate", label: "Due by", type: "date", group: "terms" }],
  },
];

export const sections: readonly {
  id: SectionId;
  label: string;
  subtitle: string;
  icon: string;
}[] = [
  { id: "liquid", label: "Liquid", subtitle: "Banking", icon: "landmark" },
  {
    id: "markets",
    label: "Markets",
    subtitle: "Investments",
    icon: "trending",
  },
  { id: "assets", label: "Assets", subtitle: "What you own", icon: "home" },
  {
    id: "liabilities",
    label: "Liabilities",
    subtitle: "What you owe",
    icon: "card",
  },
];

export const categoryIds = categories.map((c) => c.id) as [string, ...string[]];

export function findCategory(id: string | null | undefined) {
  return categories.find((c) => c.id === id);
}
export function findSection(id: string | null | undefined) {
  return sections.find((s) => s.id === id);
}
export function sectionCategories(section: SectionId) {
  return categories.filter((c) => c.section === section);
}
/** Category used for ledger accounts created before Wealth profiles existed. */
export function defaultCategory(kind: string): CategoryDef {
  const id =
    {
      BANK: "savings",
      CASH: "cash",
      FIXED_DEPOSIT: "fixed-deposits",
      INVESTMENT: "other-investments",
      RECEIVABLE: "receivables",
      OTHER_ASSET: "other-assets",
      CREDIT_CARD: "credit-cards",
      LOAN: "loans",
      OTHER_LIABILITY: "other-liabilities",
    }[kind] ?? "other-assets";
  return findCategory(id)!;
}
export function categoryHref(category: CategoryDef) {
  return `/wealth/${category.section}/${category.id}`;
}
