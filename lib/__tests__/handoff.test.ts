import * as handoff from "@/lib/handoff";
import { custodyForOrder, HANDOFF_SEQUENCE } from "@/lib/handoff";

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

describe("handoff sequence", () => {
  it("exports no shop-side checklist: readiness is one signal", () => {
    expect(Object.keys(handoff).some((name) => /check/i.test(name))).toBe(false);
  });

  it("tells the shop the rider comes to the counter and the checks are done together", () => {
    expect(custodyForOrder({ state: "production", riderId: null }).detail).toMatch(/counter/);
    expect(custodyForOrder({ state: "production", riderId: null }).detail).toMatch(/together/);
    expect(HANDOFF_SEQUENCE.map((step) => step.title)).toEqual([
      "Riders are notified",
      "The rider comes to your counter",
      "You check it together",
      "It leaves when every check passes",
    ]);
    expect(HANDOFF_SEQUENCE[2].detail).toMatch(/six pickup checks/);
  });
});
