import {
  allHandoffChecksDone,
  custodyForOrder,
  HANDOFF_CHECKS,
  handoffChecksRemaining,
} from "@/lib/handoff";

describe("custodyForOrder", () => {
  it("keeps the job with the shop until it is marked ready", () => {
    const custody = custodyForOrder({ state: "production", riderId: null });
    expect(custody.state).toBe("in_shop");
    expect(custody.nextActor).toBe("You");
  });

  it("does not claim custody has transferred while a rider is only assigned", () => {
    const custody = custodyForOrder({ state: "rider_assigned", riderId: "user_rider" });
    expect(custody.state).toBe("rider_assigned");
    expect(custody.nextActor).toBe("Rider");
  });

  it("only says the rider has it once the pickup is confirmed", () => {
    expect(custodyForOrder({ state: "picked_up", riderId: "user_rider" }).state).toBe(
      "with_rider",
    );
    expect(custodyForOrder({ state: "out_for_delivery", riderId: "user_rider" }).state).toBe(
      "with_rider",
    );
  });

  it("treats every post-delivery state as delivered", () => {
    for (const state of ["delivered", "issue_window_open", "completed", "payout_released"]) {
      expect(custodyForOrder({ state, riderId: "user_rider" }).state).toBe("delivered");
    }
  });

  it("always carries an icon and a label, so colour is never alone", () => {
    for (const state of ["production", "ready_for_dispatch", "rider_assigned", "picked_up"]) {
      const custody = custodyForOrder({ state, riderId: null });
      expect(custody.icon).toBeTruthy();
      expect(custody.label.length).toBeGreaterThan(0);
    }
  });
});

describe("handoff checks", () => {
  it("is not done until every check is confirmed", () => {
    const partial = Object.fromEntries(HANDOFF_CHECKS.slice(1).map((c) => [c.id, true]));
    expect(allHandoffChecksDone(partial)).toBe(false);
    expect(handoffChecksRemaining(partial)).toBe(1);
  });

  it("is done when all of them are", () => {
    const all = Object.fromEntries(HANDOFF_CHECKS.map((c) => [c.id, true]));
    expect(allHandoffChecksDone(all)).toBe(true);
    expect(handoffChecksRemaining(all)).toBe(0);
  });

  it("does not count a check that was ticked then unticked", () => {
    const all = Object.fromEntries(HANDOFF_CHECKS.map((c) => [c.id, true]));
    expect(allHandoffChecksDone({ ...all, packed: false })).toBe(false);
  });
});
