// INR money formatting — port of formatMoney from firebase.js.
// Uses Intl when available (Hermes), with a manual Indian-grouping fallback in
// case locale data is incomplete on-device.

function groupIndian(intStr: string): string {
  // 1234567 -> 12,34,567  (Indian lakh/crore grouping)
  if (intStr.length <= 3) return intStr;
  const last3 = intStr.slice(-3);
  const rest = intStr.slice(0, -3);
  return rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",") + "," + last3;
}

// Convert an amount to Indian-English words, e.g. 100 -> "One hundred rupees".
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

export function amountToWords(amount: number | string | null | undefined): string {
  let n = Math.floor(Math.abs(Number(amount) || 0));
  if (n === 0) return "Zero rupees";
  let words = "";
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) words += threeDigits(crore) + " Crore ";
  if (lakh) words += threeDigits(lakh) + " Lakh ";
  if (thousand) words += threeDigits(thousand) + " Thousand ";
  if (n) words += threeDigits(n) + " ";
  return words.trim() + " rupees";
}

export function formatMoney(amount: number | string | null | undefined): string {
  const n = Number(amount) || 0;
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  try {
    const out = abs.toLocaleString("en-IN");
    // Some Hermes builds ignore the locale and group as en-US; detect & fallback.
    if (out.indexOf(",") === -1 || /\d{4},/.test(out)) {
      return "₹" + sign + groupIndian(String(Math.round(abs)));
    }
    return "₹" + sign + out;
  } catch {
    return "₹" + sign + groupIndian(String(Math.round(abs)));
  }
}
