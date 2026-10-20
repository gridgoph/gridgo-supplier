import { isExpressOrder } from "@/lib/express";

describe("Express", () => {
  it("reads an order as Express only when checkout said so", () => {
    expect(isExpressOrder({ express: true })).toBe(true);
    expect(isExpressOrder({ express: false })).toBe(false);
    // Orders placed before Express carry no field.
    expect(isExpressOrder({})).toBe(false);
    expect(isExpressOrder(null)).toBe(false);
  });
});
