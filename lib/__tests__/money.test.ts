import { parseMoney, sanitizeMoneyInput } from "@/lib/money";

describe("sanitizeMoneyInput", () => {
  it("drops anything that is not a digit or a point", () => {
    expect(sanitizeMoneyInput("₱1,200.50 pesos")).toBe("1200.50");
  });

  it("keeps only the first decimal point", () => {
    expect(sanitizeMoneyInput("12.3.4")).toBe("12.34");
  });

  it("caps the decimals at two", () => {
    expect(sanitizeMoneyInput("12.3456")).toBe("12.34");
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

  it("rounds rather than truncating a fractional centavo", () => {
    expect(parseMoney("10.005")).toEqual({ ok: true, minor: 1001 });
  });

  it("rejects an amount below one peso with a fix", () => {
    const result = parseMoney("0.50");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("at least ₱1.00");
  });

  it("rejects an amount above the limit with a route out", () => {
    const result = parseMoney("2000000");
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.error).toContain("Operations");
  });

  it("rejects something that is not a number", () => {
    expect(parseMoney(".").ok).toBe(false);
  });
});
