// Static institution / app marks. Each known bank, platform, AMC or issuer gets
// a brand-coloured monogram rendered locally (no network fetches, no third-party
// logo files). Unknown names still get a deterministic generated mark.
export type InstitutionKind =
  | "bank"
  | "small-finance-bank"
  | "platform"
  | "broker"
  | "amc"
  | "government"
  | "issuer";

export type Institution = Readonly<{
  key: string;
  name: string;
  kind: InstitutionKind;
  mark: string;
  background: string;
  foreground?: string;
  aliases?: readonly string[];
}>;

const b = (
  key: string,
  name: string,
  mark: string,
  background: string,
  aliases: string[] = [],
  kind: InstitutionKind = "bank",
  foreground?: string,
): Institution => ({ key, name, mark, background, aliases, kind, foreground });

export const institutions: readonly Institution[] = [
  // Banks
  b("hdfc-bank", "HDFC Bank", "H", "#004C8F", ["hdfc"]),
  b("sbi", "State Bank of India", "SBI", "#1A4D9C", ["sbi", "state bank"]),
  b("icici-bank", "ICICI Bank", "i", "#AE282E", ["icici"]),
  b("axis-bank", "Axis Bank", "A", "#97144D", ["axis"]),
  b("kotak-bank", "Kotak Mahindra Bank", "K", "#ED1C24", ["kotak"]),
  b("idfc-first-bank", "IDFC FIRST Bank", "IF", "#9C1D26", [
    "idfc",
    "idfc first",
  ]),
  b("yes-bank", "Yes Bank", "Y", "#0060AA", ["yes"]),
  b("indusind-bank", "IndusInd Bank", "IB", "#8B1D2C", ["indusind"]),
  b("bank-of-baroda", "Bank of Baroda", "BoB", "#F26522", ["bob", "baroda"]),
  b("pnb", "Punjab National Bank", "PNB", "#A20A3A", ["punjab national"]),
  b("canara-bank", "Canara Bank", "C", "#0091D5", ["canara"]),
  b("union-bank", "Union Bank of India", "U", "#D71920", ["union bank"]),
  b("bank-of-india", "Bank of India", "BoI", "#F37021", []),
  b("indian-bank", "Indian Bank", "IN", "#1C3F94", []),
  b("central-bank", "Central Bank of India", "CB", "#C8102E", []),
  b("idbi-bank", "IDBI Bank", "ID", "#00836C", ["idbi"]),
  b("federal-bank", "Federal Bank", "F", "#1F4E9D", ["federal"]),
  b("rbl-bank", "RBL Bank", "R", "#21409A", ["rbl"]),
  b("bandhan-bank", "Bandhan Bank", "B", "#E31E25", ["bandhan"]),
  b("dbs-bank", "DBS Bank", "DBS", "#E21B23", ["dbs", "digibank"]),
  b("hsbc", "HSBC", "HS", "#DB0011", []),
  b("standard-chartered", "Standard Chartered", "SC", "#0473EA", ["stanchart"]),
  b("citi", "Citibank", "Ci", "#056DAE", ["citi"]),
  b("amex", "American Express", "AX", "#016FD0", ["amex"]),
  // Small finance banks (popular FD destinations)
  b(
    "suryoday-sfb",
    "Suryoday Small Finance Bank",
    "S",
    "#F58220",
    ["suryoday"],
    "small-finance-bank",
  ),
  b(
    "unity-sfb",
    "Unity Small Finance Bank",
    "U",
    "#5B2C83",
    ["unity"],
    "small-finance-bank",
  ),
  b(
    "utkarsh-sfb",
    "Utkarsh Small Finance Bank",
    "Ut",
    "#4B2E83",
    ["utkarsh"],
    "small-finance-bank",
  ),
  b(
    "shivalik-sfb",
    "Shivalik Small Finance Bank",
    "Sh",
    "#00838F",
    ["shivalik"],
    "small-finance-bank",
  ),
  b(
    "au-sfb",
    "AU Small Finance Bank",
    "AU",
    "#6D2077",
    ["au bank", "au small"],
    "small-finance-bank",
  ),
  b(
    "equitas-sfb",
    "Equitas Small Finance Bank",
    "E",
    "#F47B20",
    ["equitas"],
    "small-finance-bank",
  ),
  b(
    "ujjivan-sfb",
    "Ujjivan Small Finance Bank",
    "Uj",
    "#00529C",
    ["ujjivan"],
    "small-finance-bank",
  ),
  b(
    "jana-sfb",
    "Jana Small Finance Bank",
    "J",
    "#00A859",
    ["jana"],
    "small-finance-bank",
  ),
  b(
    "esaf-sfb",
    "ESAF Small Finance Bank",
    "ES",
    "#0A8F3C",
    ["esaf"],
    "small-finance-bank",
  ),
  b(
    "slice-bank",
    "slice small finance bank",
    "sl",
    "#6C2BD9",
    ["slice", "north east sfb"],
    "small-finance-bank",
  ),
  b("bajaj-finance", "Bajaj Finance", "BF", "#005BAC", ["bajaj"], "issuer"),
  b(
    "shriram-finance",
    "Shriram Finance",
    "SF",
    "#00447C",
    ["shriram"],
    "issuer",
  ),
  // Government
  b(
    "india-post",
    "India Post",
    "IP",
    "#C8102E",
    ["post office", "indiapost", "post"],
    "government",
  ),
  b(
    "rbi-retail-direct",
    "RBI Retail Direct",
    "RBI",
    "#0B3D91",
    ["rbi"],
    "government",
  ),
  b(
    "government-of-india",
    "Government of India",
    "GoI",
    "#FF9933",
    ["goi"],
    "government",
    "#1A1A1A",
  ),
  b("epfo", "EPFO", "EPF", "#1E3A8A", ["provident fund"], "government"),
  b(
    "protean-nps",
    "NPS (Protean CRA)",
    "NPS",
    "#004B8D",
    ["nps", "protean", "cra"],
    "government",
  ),
  // Apps / platforms / brokers
  b(
    "stable-money",
    "Stable Money",
    "SM",
    "#3F2BBF",
    ["stablemoney", "stable"],
    "platform",
  ),
  b("zerodha", "Zerodha", "Z", "#387ED1", ["kite"], "broker"),
  b("zerodha-coin", "Zerodha Coin", "Co", "#387ED1", ["coin"], "platform"),
  b("groww", "Groww", "G", "#00B386", [], "broker"),
  b("upstox", "Upstox", "Up", "#5A298B", [], "broker"),
  b("angel-one", "Angel One", "A1", "#1D4ED8", ["angel"], "broker"),
  b("dhan", "Dhan", "D", "#0A7D5E", [], "broker"),
  b("icici-direct", "ICICI Direct", "iD", "#F37E20", [], "broker"),
  b(
    "hdfc-securities",
    "HDFC Securities",
    "HS",
    "#004C8F",
    ["hdfc sec"],
    "broker",
  ),
  b("kuvera", "Kuvera", "Kv", "#0055A5", [], "platform"),
  b(
    "paytm-money",
    "Paytm Money",
    "PM",
    "#00BAF2",
    ["paytm"],
    "platform",
    "#062A4D",
  ),
  b("indmoney", "INDmoney", "IND", "#0B0B45", ["ind money"], "platform"),
  b("et-money", "ET Money", "ET", "#E5322D", ["etmoney"], "platform"),
  b("smallcase", "smallcase", "sc", "#1F7AE0", [], "platform"),
  b("wint-wealth", "Wint Wealth", "W", "#14532D", ["wint"], "platform"),
  b("goldenpi", "GoldenPi", "GP", "#B8860B", [], "platform"),
  b("fixerra", "Fixerra", "Fx", "#0E7490", [], "platform"),
  b("jar", "Jar", "Jar", "#3D1C78", [], "platform"),
  b("mmtc-pamp", "MMTC-PAMP", "MP", "#8C6D1F", ["mmtc"], "issuer"),
  b("jupiter", "Jupiter", "Ju", "#F2683C", [], "platform"),
  b("fi-money", "Fi Money", "Fi", "#00B899", ["fi"], "platform"),
  b("onecard", "OneCard", "1", "#111111", [], "issuer"),
  b("scapia", "Scapia", "Sp", "#7C3AED", [], "issuer"),
  b("cred", "CRED", "CR", "#1B1B1B", [], "platform"),
  // Mutual fund houses
  b(
    "ppfas-mf",
    "PPFAS Mutual Fund",
    "PP",
    "#1B3B6F",
    ["parag parikh", "ppfas"],
    "amc",
  ),
  b("mirae-mf", "Mirae Asset Mutual Fund", "MA", "#F58025", ["mirae"], "amc"),
  b(
    "sbi-mf",
    "SBI Mutual Fund",
    "SBI",
    "#2B3990",
    ["sbi mf", "sbi mutual"],
    "amc",
  ),
  b(
    "hdfc-mf",
    "HDFC Mutual Fund",
    "H",
    "#004C8F",
    ["hdfc mf", "hdfc mutual"],
    "amc",
  ),
  b(
    "icici-pru-mf",
    "ICICI Prudential Mutual Fund",
    "iP",
    "#B02A30",
    ["icici pru", "icici prudential"],
    "amc",
  ),
  b(
    "axis-mf",
    "Axis Mutual Fund",
    "A",
    "#97144D",
    ["axis mf", "axis mutual"],
    "amc",
  ),
  b("nippon-mf", "Nippon India Mutual Fund", "N", "#E2231A", ["nippon"], "amc"),
  b(
    "kotak-mf",
    "Kotak Mutual Fund",
    "K",
    "#ED1C24",
    ["kotak mf", "kotak mutual"],
    "amc",
  ),
  b("uti-mf", "UTI Mutual Fund", "UTI", "#1A3E8C", ["uti"], "amc"),
  b("quant-mf", "quant Mutual Fund", "q", "#111827", ["quant"], "amc"),
  b(
    "motilal-mf",
    "Motilal Oswal Mutual Fund",
    "MO",
    "#F7A600",
    ["motilal"],
    "amc",
    "#1A1A1A",
  ),
  b("dsp-mf", "DSP Mutual Fund", "DSP", "#0A2240", ["dsp"], "amc"),
  b(
    "tata-mf",
    "Tata Mutual Fund",
    "T",
    "#1F4E9D",
    ["tata mf", "tata mutual"],
    "amc",
  ),
  b(
    "absl-mf",
    "Aditya Birla Sun Life Mutual Fund",
    "AB",
    "#C8102E",
    ["aditya birla", "absl"],
    "amc",
  ),
  b("navi-mf", "Navi Mutual Fund", "Nv", "#0B9D58", ["navi"], "amc"),
];

const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function institutionByKey(key: string | null | undefined) {
  return key ? institutions.find((i) => i.key === key) : undefined;
}

/** Best effort match from free text ("hdfc", "Stable money app"…). */
export function matchInstitution(name: string | null | undefined) {
  const n = normal(name ?? "");
  if (!n) return undefined;
  const exact = institutions.find(
    (i) => normal(i.name) === n || i.aliases?.some((a) => normal(a) === n),
  );
  if (exact) return exact;
  // Longest alias contained in the text wins ("idfc first bank savings" → IDFC).
  let best: Institution | undefined;
  let length = 0;
  for (const i of institutions)
    for (const alias of [i.name, ...(i.aliases ?? [])]) {
      const a = normal(alias);
      if (a.length >= 3 && a.length > length && ` ${n} `.includes(` ${a} `)) {
        best = i;
        length = a.length;
      }
    }
  return best;
}

const palette = [
  "#165D4F",
  "#7C3AED",
  "#B45309",
  "#0E7490",
  "#BE185D",
  "#1D4ED8",
  "#4D7C0F",
  "#9F1239",
];
/** Deterministic mark for names not in the registry. */
export function generatedMark(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const mark =
    words.length > 1
      ? (words[0]![0]! + words[1]![0]!).toUpperCase()
      : (words[0] ?? "?").slice(0, 2).toUpperCase();
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { mark, background: palette[hash % palette.length]! };
}

export function institutionSuggestions(kinds?: readonly InstitutionKind[]) {
  return kinds
    ? institutions.filter((i) => kinds.includes(i.kind))
    : institutions;
}
