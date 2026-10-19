import type { Order } from "@/lib/api";
import { isTightBeforeAccepting, sameDayReadyLine } from "@/lib/scheduling";

type SchedulingOrder = Pick<Order, "state" | "shopRecovery" | "scheduling" | "readyBy">;

const offered = (partial: Partial<SchedulingOrder> = {}): SchedulingOrder => ({
  state: "supplier_assigned",
  shopRecovery: null,
  readyBy: "2026-10-23T07:00:00.000Z",
  scheduling: null,
  ...partial,
});

const TIGHT = { status: "tight", sameDay: false, tightDeadline: true, label: "Tight deadline" } as const;
const SECURED = { status: "secured", sameDay: false, tightDeadline: false, label: null } as const;
const SAME_DAY = { status: "secured", sameDay: true, tightDeadline: false, label: null } as const;

describe("a Tight deadline", () => {
  it("is flagged before the shop answers", () => {
    expect(isTightBeforeAccepting(offered({ scheduling: TIGHT }))).toBe(true);
  });

  it("is not flagged once the shop has accepted or let the job go", () => {
    expect(isTightBeforeAccepting(offered({ scheduling: TIGHT, state: "production" }))).toBe(false);
    expect(
      isTightBeforeAccepting(
        offered({ scheduling: TIGHT, shopRecovery: { id: "rec_1", status: "awaiting_client" } }),
      ),
    ).toBe(false);
  });

  it("is not flagged on a secured date", () => {
    expect(isTightBeforeAccepting(offered({ scheduling: SECURED }))).toBe(false);
    expect(sameDayReadyLine(offered({ scheduling: SECURED }))).toBeNull();
  });

  it("reads an older GRIDGO without scheduling as neither", () => {
    expect(isTightBeforeAccepting(offered())).toBe(false);
    expect(isTightBeforeAccepting(offered({ scheduling: undefined }))).toBe(false);
    expect(sameDayReadyLine(offered())).toBeNull();
    expect(isTightBeforeAccepting(null)).toBe(false);
  });
});

describe("a same-day job", () => {
  it("says the shop's own ready-by clock time in Manila", () => {
    expect(sameDayReadyLine(offered({ scheduling: SAME_DAY }))).toBe("Same-day job · ready by 3:00 PM");
  });

  it("can be Tight as well", () => {
    const order = offered({ scheduling: { ...TIGHT, sameDay: true } });
    expect(isTightBeforeAccepting(order)).toBe(true);
    expect(sameDayReadyLine(order)).toBe("Same-day job · ready by 3:00 PM");
  });

  it("says nothing without a ready-by time or after acceptance", () => {
    expect(sameDayReadyLine(offered({ scheduling: SAME_DAY, readyBy: null }))).toBeNull();
    expect(sameDayReadyLine(offered({ scheduling: SAME_DAY, state: "production" }))).toBeNull();
  });
});
