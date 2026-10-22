import { CATALOG_MONEY_INVALID, CATALOG_MONEY_MAX_MINOR, CATALOG_MONEY_OVER } from "@/lib/catalogBounds";

/**
 * Peso entry.
 *
 * Money is not a count, so it is keyed rather than stepped — but it is still
 * structured: the app owns the peso sign, only digits and one decimal point are
 * accepted, and the amount is checked against the catalogue's centavo rules
 * before it can be sent.
 */

/** Format PHP minor units (centavos) for display. */
export function formatPhp(minor: number): string {
  return `₱${(minor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Digits, at most one decimal point, at most two decimal places.
 * Fourteen whole digits is the longest peso amount whose centavos still fit
 * in the catalogue's safe integer.
 */
export function sanitizeMoneyInput(text: string): string {
  const cleaned = text.replace(/[^0-9.]/g, "");
  const [whole, ...rest] = cleaned.split(".");
  if (!rest.length) return whole.slice(0, 14);
  return `${whole.slice(0, 14)}.${rest.join("").slice(0, 2)}`;
}

/**
 * Catalogue prices are safe centavo integers from 0 up (`moneyMinor` in
 * gridgo-api). ₱0.00 and ₱0.50 are prices. There is no ₱1 floor and no
 * ₱1,000,000 ceiling.
 */
export const MONEY_BOUNDS = { minMinor: 0, maxMinor: CATALOG_MONEY_MAX_MINOR } as const;

export type MoneyParse =
  | { ok: true; minor: number | null }
  | { ok: false; error: string };

/**
 * Pesos as typed → centavos. An empty field parses as "nothing entered", which
 * is why `minor` can be null on success — the screen decides whether that is
 * allowed, since a price is required to accept a job but a filter is not.
 */
export function parseMoney(value: string): MoneyParse {
  const trimmed = value.trim();
  if (!trimmed) return { ok: true, minor: null };

  const cleaned = trimmed.replace(/,/g, "");
  // A trailing dot is a half-typed peso amount. A third decimal is not stored,
  // so it is refused rather than rounded into a different number of centavos.
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) {
    return { ok: false, error: CATALOG_MONEY_INVALID };
  }
  const [whole, frac = ""] = cleaned.split(".");
  const cents = (frac + "00").slice(0, 2);
  let minor: bigint;
  try {
    minor = BigInt(whole) * 100n + BigInt(cents);
  } catch {
    return { ok: false, error: CATALOG_MONEY_INVALID };
  }
  if (minor > BigInt(MONEY_BOUNDS.maxMinor)) {
    return { ok: false, error: CATALOG_MONEY_OVER };
  }
  return { ok: true, minor: Number(minor) };
}
