// Money formatting with a user-selectable currency. The active currency lives in
// a module variable (set by CurrencyProvider) so the plain formatMoney() function
// — called in ~100 places — picks up the choice without threading a hook through
// every call site. Changing currency remounts the app tree so everything refreshes.

export interface CurrencyDef {
  code: string;
  symbol: string;
  word: string; // spoken name, e.g. "rupees"
  grouping: "indian" | "western";
}

// Currencies the user can pick from in Profile.
export const CURRENCIES: CurrencyDef[] = [
  { code: "INR", symbol: "₹", word: "rupees", grouping: "indian" },
  { code: "USD", symbol: "$", word: "dollars", grouping: "western" },
  { code: "EUR", symbol: "€", word: "euros", grouping: "western" },
  { code: "GBP", symbol: "£", word: "pounds", grouping: "western" },
  { code: "AED", symbol: "AED ", word: "dirham", grouping: "western" },
  { code: "JPY", symbol: "¥", word: "yen", grouping: "western" },
  { code: "AUD", symbol: "A$", word: "dollars", grouping: "western" },
  { code: "CAD", symbol: "C$", word: "dollars", grouping: "western" },
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
