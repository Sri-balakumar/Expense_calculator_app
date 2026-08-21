// Exchange rates for the currency switch. Free endpoint, no API key.
//
// Every failure path here returns null rather than throwing: the rate field in
// the UI stays editable and the migration must never become unreachable just
// because a third-party service is slow, rate-limited, or gone.

const ENDPOINT = "https://open.er-api.com/v6/latest/";
const TIMEOUT_MS = 8000;

export async function fetchRate(from: string, to: string): Promise<number | null> {
  if (!from || !to) return null;
  if (from === to) return 1;
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const res = await fetch(ENDPOINT + encodeURIComponent(from), { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json: any = await res.json();
    const rate = json?.rates?.[to];
    if (typeof rate !== "number" || !isFinite(rate) || rate <= 0) return null;
    console.log("[FX] rate", from, "->", to, rate);
    return rate;
  } catch (e: any) {
    console.log("[FX] rate fetch failed", e?.message);
    return null;
  }
}
