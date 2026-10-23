import { formatPhp, moneyInputValue, parseMoney, sanitizeMoneyInput } from "@/lib/money";

describe("sanitizeMoneyInput", () => {
  it("drops anything that is not a digit or a point", () => {
    expect(sanitizeMoneyInput("₱1,200.50 pesos")).toBe("1200.50");
  });

  it("keeps extra decimal points for validation", () => {
    expect(parseMoney(sanitizeMoneyInput("12.3.4")).ok).toBe(false);
  });

  it("refuses extra decimals and oversized amounts without changing their value", () => {
    expect(sanitizeMoneyInput("12.3456")).toBe("12.3456");
    expect(parseMoney(sanitizeMoneyInput("12.3456")).ok).toBe(false);
    expect(parseMoney(sanitizeMoneyInput("100000000000000")).ok).toBe(false);
  });

  it("leaves a half-typed amount alone", () => {
    expect(sanitizeMoneyInput("12.")).toBe("12.");
  });
});

describe("parseMoney", () => {
  it("treats an empty field as leaving the quote alone", () => {
    expect(parseMoney("")).toEqual({ ok: true, minor: null });
    expect(parseMoney("   ")).toEqual({ ok: true, minor: null });
  });

  it("converts pesos to centavos", () => {
    expect(parseMoney("1200.50")).toEqual({ ok: true, minor: 120050 });
  });

  it("refuses a third decimal instead of rounding it into different centavos", () => {
    const result = parseMoney("10.005");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("1200.00");
  });

  it("keeps zero, a sub-peso amount, and a price above ₱1,000,000", () => {
    expect(parseMoney("0")).toEqual({ ok: true, minor: 0 });
    expect(parseMoney("0.50")).toEqual({ ok: true, minor: 50 });
    expect(parseMoney("1000001")).toEqual({ ok: true, minor: 100000100 });
    expect(parseMoney("2000000")).toEqual({ ok: true, minor: 200000000 });
  });

  it("refuses an amount past the safe centavo integer", () => {
    const result = parseMoney("90071992547409.92");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("largest whole-centavo");
  });

  it("rejects something that is not a number", () => {
    expect(parseMoney(".").ok).toBe(false);
  });
});

describe("moneyInputValue", () => {
  it.each([0, 50, 100000100, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER])(
    "round trips %i centavos without rounding",
    (minor) => expect(parseMoney(moneyInputValue(minor))).toEqual({ ok: true, minor }),
  );
});

describe("formatPhp", () => {
  it("shows safe-integer centavos exactly, including negative adjustments", () => {
    expect(formatPhp(Number.MAX_SAFE_INTEGER)).toBe("₱90,071,992,547,409.91");
    expect(formatPhp(Number.MAX_SAFE_INTEGER - 1)).toBe("₱90,071,992,547,409.90");
    expect(formatPhp(-50)).toBe("₱-0.50");
  });
});
