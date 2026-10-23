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
  const cents = BigInt(Math.abs(minor));
  const whole = Number(cents / 100n).toLocaleString("en-PH");
  const fraction = String(cents % 100n).padStart(2, "0");
  return `₱${minor < 0 ? "-" : ""}${whole}.${fraction}`;
}

/** Remove presentation characters, keeping the amount intact for validation. */
export function sanitizeMoneyInput(text: string): string {
  return text.replace(/[^0-9.]/g, "");
}

/** Exact peso text for editing; dividing a large centavo integer loses precision. */
export function moneyInputValue(minor: number): string {
  const cents = BigInt(minor);
  return `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`;
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
