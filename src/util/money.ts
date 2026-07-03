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
