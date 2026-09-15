// Money formatting with a user-selectable currency. The active currency lives in
// a module variable (set by CurrencyProvider) so the plain formatMoney() function
// — called in ~100 places — picks up the choice without threading a hook through
// every call site. Changing currency remounts the app tree so everything refreshes.

export interface CurrencyDef {
  code: string;
  symbol: string;
  name: string; // display name, e.g. "Indian Rupee"
  word: string; // spoken name, e.g. "rupees"
  grouping: "indian" | "western";
}

// Currencies the user can pick from in Profile.
export const CURRENCIES: CurrencyDef[] = [
  { code: "INR", symbol: "₹", name: "Indian Rupee", word: "rupees", grouping: "indian" },
  { code: "USD", symbol: "$", name: "US Dollar", word: "dollars", grouping: "western" },
  { code: "EUR", symbol: "€", name: "Euro", word: "euros", grouping: "western" },
  { code: "GBP", symbol: "£", name: "British Pound", word: "pounds", grouping: "western" },
  { code: "AED", symbol: "AED ", name: "UAE Dirham", word: "dirham", grouping: "western" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", word: "yen", grouping: "western" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar", word: "dollars", grouping: "western" },
  { code: "CAD", symbol: "C$", name: "Canadian Dollar", word: "dollars", grouping: "western" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar", word: "dollars", grouping: "western" },
  { code: "MYR", symbol: "RM", name: "Malaysian Ringgit", word: "ringgit", grouping: "western" },
  { code: "SAR", symbol: "SAR ", name: "Saudi Riyal", word: "riyals", grouping: "western" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan", word: "yuan", grouping: "western" },
];

let active: CurrencyDef = CURRENCIES[0];

export function setActiveCurrency(code: string): void {
  active = CURRENCIES.find((c) => c.code === code) || CURRENCIES[0];
}
export function currencySymbol(): string {
  return active.symbol;
}
export function currencyCode(): string {
  return active.code;
}

function groupIndian(intStr: string): string {
  // 1234567 -> 12,34,567  (Indian lakh/crore grouping)
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

function groupWestern(intStr: string): string {
  // 1234567 -> 1,234,567
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

// Convert an amount to English words. Uses Indian (lakh/crore) or Western
// (thousand/million/billion) grouping to match the active currency.
const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten",
  "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen",
  "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(x: number): string {
  if (x < 20) return ONES[x];
  return TENS[Math.floor(x / 10)] + (x % 10 ? " " + ONES[x % 10] : "");
}

function threeDigits(x: number): string {
  const h = Math.floor(x / 100);
  const r = x % 100;
  return (h ? ONES[h] + " Hundred" + (r ? " " : "") : "") + (r ? twoDigits(r) : "");
}

function wordsIndian(n: number): string {
  let words = "";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) words += threeDigits(crore) + " Crore ";
  if (lakh) words += threeDigits(lakh) + " Lakh ";
  if (thousand) words += threeDigits(thousand) + " Thousand ";
  if (n) words += threeDigits(n) + " ";
  return words.trim();
}

function wordsWestern(n: number): string {
  const scales = ["", " Thousand", " Million", " Billion", " Trillion"];
  const parts: string[] = [];
  let i = 0;
  while (n > 0 && i < scales.length) {
    const g = n % 1000;
    if (g) parts.unshift(threeDigits(g) + scales[i]);
    n = Math.floor(n / 1000);
    i++;
  }
  return parts.join(" ").trim();
}

export function amountToWords(amount: number | string | null | undefined): string {
  const n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return `Zero ${active.word}`;
  const words = active.grouping === "indian" ? wordsIndian(n) : wordsWestern(n);
  return `${words} ${active.word}`;
}

// Format in a specific currency without disturbing the active one. Used by the
// currency switch to preview "before -> after" side by side, since formatMoney()
// itself always speaks whatever currency the account is currently set to.
export function formatMoneyIn(code: string, amount: number | string | null | undefined): string {
  const prev = active;
  const next = CURRENCIES.find((c) => c.code === code);
  if (next) active = next;
  try {
    return formatMoney(amount);
  } finally {
    active = prev;
  }
}

export function formatMoney(amount: number | string | null | undefined): string {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const sym = active.symbol;
  const indian = active.grouping === "indian";
  const locale = indian ? "en-IN" : "en-US";
  const group = indian ? groupIndian : groupWestern;
  try {
    const out = abs.toLocaleString(locale);
    // Some Hermes builds ignore the locale and group as en-US; detect & fallback.
    if (out.indexOf(",") === -1 || (indian && /\d{4},/.test(out))) {
      return sym + sign + group(String(Math.round(abs)));
    }
    return sym + sign + out;
  } catch {
    return sym + sign + group(String(Math.round(abs)));
  }
}

// ---- amount validation ------------------------------------------------------
//
// Every screen used to hand-roll `if (!amt || amt <= 0) return "Enter a valid
// amount."`. That test has a hole: Number("1e999") is Infinity, which is truthy
// and is not <= 0, so it sailed through and was written to Firestore as a
// double. From then on every `Number(x) || 0` sum downstream — month totals,
// year charts, plan progress — evaluated to Infinity or NaN, permanently and
// with no way to spot which entry did it.
//
// There is deliberately no hard ceiling. A cap would one day refuse an amount
// somebody genuinely meant; callers confirm above LARGE_AMOUNT instead.

/** Above this, ask the user to confirm rather than refusing. */
export const LARGE_AMOUNT = 1000000;

export type AmountResult =
  | { ok: true; value: number }
  | { ok: false; reason: "empty" | "invalid" | "negative" };

export function parseAmount(raw: string | number | null | undefined): AmountResult {
  if (raw === null || raw === undefined || String(raw).trim() === "") {
    return { ok: false, reason: "empty" };
  }
  const n = Number(raw);
  // Catches NaN AND Infinity — the latter is the one that used to get through.
  if (!Number.isFinite(n)) return { ok: false, reason: "invalid" };
  if (n <= 0) return { ok: false, reason: "negative" };
  return { ok: true, value: Math.round(n * 100) / 100 };
}

/** The message to show for a rejected amount, so every screen says the same thing. */
export function amountError(reason: "empty" | "invalid" | "negative"): string {
  if (reason === "empty") return "Enter an amount.";
  if (reason === "invalid") return "That isn't a number we can use.";
  return "Enter an amount greater than zero.";
}

/** True when the amount is large enough to be worth double-checking. */
export function isLargeAmount(value: number): boolean {
  return value > LARGE_AMOUNT;
}
