import type { FxRates } from "./settings";

export const CURRENCIES = ["INR", "AED", "CNY", "USD", "EUR"];

/** How many `to` one `from` buys, using the INR-based table. */
export function fxRate(rates: FxRates, from: string, to: string) {
  if (from === to) return 1;
  const a = rates.perINR[from];
  const b = rates.perINR[to];
  if (!a || !b) throw new Error(`No exchange rate for ${!a ? from : to}. Add it on the Rates page.`);
  return a / b;
}

export function convert(rates: FxRates, amount: number, from: string, to: string) {
  return amount * fxRate(rates, from, to);
}
