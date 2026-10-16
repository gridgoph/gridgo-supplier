import {
  EXPRESS_SWITCH_CAUTION,
  EXPRESS_SWITCH_HELP,
  expressStateLine,
  isExpressListing,
  isExpressOrder,
} from "@/lib/express";
import { normalizeListing } from "@/lib/listings";

describe("Express", () => {
  it("reads an order as Express only when checkout said so", () => {
    expect(isExpressOrder({ express: true })).toBe(true);
    expect(isExpressOrder({ express: false })).toBe(false);
    // Orders placed before Express carry no field.
    expect(isExpressOrder({})).toBe(false);
    expect(isExpressOrder(null)).toBe(false);
  });

  it("keeps a listing's switch, and null from a GRIDGO that predates it", () => {
    expect(normalizeListing({ item: { id: "sci_1", express: true } })?.express).toBe(true);
    expect(normalizeListing({ item: { id: "sci_1", express: false } })?.express).toBe(false);
    expect(normalizeListing({ item: { id: "sci_1" } })?.express).toBeNull();
    expect(normalizeListing({ item: { id: "sci_1", express: "yes" } })?.express).toBeNull();
    expect(isExpressListing({ express: null })).toBe(false);
  });

  it("explains the switch in the words the supplier website uses", () => {
    expect(EXPRESS_SWITCH_HELP).toMatch(/any deadline from today, the same day included/);
    expect(EXPRESS_SWITCH_HELP).toMatch(/no extra charge/);
    expect(EXPRESS_SWITCH_CAUTION).toMatch(/only if you can finish an order the day it comes in/);
    expect(EXPRESS_SWITCH_CAUTION).toMatch(/at once, with no review/);
    expect(expressStateLine(true)).toBe("Express is on. Clients can choose today as their deadline.");
    expect(expressStateLine(false)).toBe("Express is off. Deadlines follow your production time.");
  });
});
