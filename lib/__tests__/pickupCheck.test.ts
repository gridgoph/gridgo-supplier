import type { Order } from "@/lib/api";
import { presentAlertBody, stageForAlert } from "@/lib/alertStages";
import { custodyForOrder } from "@/lib/handoff";
import { presentJobStatus } from "@/lib/jobState";
import { counterCheck, countTargets, isPickupBlocked, presentCheckCodes } from "@/lib/pickupCheck";

const ALL_PASSED = [
  "quantity_match",
  "specification_match",
  "visible_defects",
  "packaging_integrity",
  "documentation",
  "supplier_sign_off",
].map((code) => ({ code, passed: true }));

function failing(...codes: string[]) {
  return ALL_PASSED.map((check) => ({ ...check, passed: !codes.includes(check.code) }));
}

type CheckOrder = Pick<
  Order,
  "state" | "riderId" | "title" | "timeline" | "pickupChecklist" | "pickupCountItems"
>;

function order(partial: Partial<CheckOrder> = {}): CheckOrder {
  return {
    state: "rider_assigned",
    riderId: "user_rider",
    title: "School event flyers",
    timeline: [],
    pickupCountItems: [
      { lineItemId: "cline_flyers", itemName: "A5 flyers", expectedQuantity: 500 },
      { lineItemId: "cline_stickers", itemName: "Round stickers", expectedQuantity: 200 },
    ],
    pickupChecklist: null,
    ...partial,
  };
}

const BLOCKED = order({
  pickupChecklist: {
    status: "failed_escalated",
    checks: failing("quantity_match", "visible_defects"),
    counts: [
      { lineItemId: "cline_flyers", expectedQuantity: 500, countedQuantity: 488 },
      { lineItemId: "cline_stickers", expectedQuantity: 200, countedQuantity: 200 },
    ],
    failureNote: "Twelve flyers missing and the top sheet is smudged.",
    completedAt: "2026-09-27T06:14:00.000Z",
    completedBy: "user_rider",
    escalationId: "esc_1",
    handoffSignature: null,
  },
});

describe("counter check", () => {
  it("is absent until a rider has checked the package", () => {
    expect(counterCheck(order())).toBeNull();
  });

  it("says a failed check blocks the pickup and names who fixes it", () => {
    const check = counterCheck(BLOCKED)!;
    expect(check.stage).toBe("blocked");
    expect(check.status).toBe("Pickup blocked");
    expect(check.headline).toBe("Fix it with Operations; the rider will check again");
    expect(check.failed).toEqual(["Count against the order", "Free of visible defects"]);
    expect(check.passed).toHaveLength(4);
    expect(check.riderNote).toBe("Twelve flyers missing and the top sheet is smudged.");
  });

  it("puts ordered beside counted, per line, and says the gap in words", () => {
    const [flyers, stickers] = counterCheck(BLOCKED)!.counts!;
    expect(flyers).toMatchObject({ name: "A5 flyers", expected: 500, counted: 488, difference: "12 short", matches: false });
    expect(stickers).toMatchObject({ name: "Round stickers", difference: "Matches", matches: true });
  });

  it("calls a surplus extra rather than short", () => {
    const check = counterCheck(
      order({
        pickupChecklist: {
          status: "failed_escalated",
          checks: failing("quantity_match"),
          counts: [{ lineItemId: "cline_flyers", expectedQuantity: 500, countedQuantity: 503 }],
        },
      }),
    )!;
    expect(check.counts![0].difference).toBe("3 extra");
  });

  it("says a count from before counts existed was not recorded, never zero", () => {
    const check = counterCheck(
      order({ pickupChecklist: { status: "failed_escalated", checks: failing("visible_defects") } }),
    )!;
    expect(check.counts).toBeNull();
  });

  it("names an old single-line order by its title", () => {
    const check = counterCheck(
      order({
        pickupCountItems: [{ lineItemId: null, itemName: "", expectedQuantity: 100 }],
        pickupChecklist: {
          status: "failed_escalated",
          checks: failing("quantity_match"),
          counts: [{ lineItemId: null, expectedQuantity: 100, countedQuantity: 90 }],
        },
      }),
    )!;
    expect(check.counts![0].name).toBe("School event flyers");
  });

  it("waits on the rider once Operations clears it, with Operations' words", () => {
    const check = counterCheck(
      order({
        pickupChecklist: { ...BLOCKED.pickupChecklist!, status: "escalation_resolved" },
        timeline: [
          {
            at: "2026-09-27T07:00:00.000Z",
            state: "rider_assigned",
            by: "user_ops",
            note: "Pickup escalation resolved; repeat all six checks: Shop reprinted twelve flyers.",
          },
        ],
      }),
    )!;
    expect(check.stage).toBe("recheck");
    expect(check.status).toBe("Rider will check again");
    expect(check.operationsNote).toBe("Shop reprinted twelve flyers.");
  });

  it("records a passed check with who signed", () => {
    const check = counterCheck(
      order({
        state: "picked_up",
        pickupChecklist: {
          status: "passed",
          checks: ALL_PASSED,
          counts: [{ lineItemId: "cline_flyers", expectedQuantity: 500, countedQuantity: 500 }],
          handoffSignature: { signerName: "Ana Reyes", signedAt: "2026-09-27T08:00:00.000Z" },
        },
      }),
    )!;
    expect(check.stage).toBe("passed");
    expect(check.failed).toEqual([]);
    expect(check.detail).toBe("Ana Reyes signed for the handoff.");
  });

  it("lists what the rider will count so the shop can count it first", () => {
    expect(countTargets(order())).toEqual([
      { key: "cline_flyers", name: "A5 flyers", expected: 500 },
      { key: "cline_stickers", name: "Round stickers", expected: 200 },
    ]);
    expect(countTargets(order({ pickupCountItems: null }))).toEqual([]);
  });
});

describe("a blocked pickup across the app", () => {
  it("speaks over 'Rider assigned' on the job's chip", () => {
    expect(presentJobStatus(BLOCKED as Order).label).toBe("Pickup blocked");
    expect(presentJobStatus(order() as Order).label).toBe("Rider assigned");
  });

  it("keeps custody with the shop", () => {
    expect(isPickupBlocked(BLOCKED)).toBe(true);
    const custody = custodyForOrder(BLOCKED);
    expect(custody.state).toBe("pickup_blocked");
    expect(custody.nextActor).toBe("You");
    expect(custody.detail).toContain("Fix it with Operations; the rider will check again");
  });

  it("translates check codes in the shop's pickup-issue alert", () => {
    const body = presentAlertBody({
      type: "shop_pickup_issue_changed",
      body: "quantity_match, visible_defects: Twelve missing. Fix these items with Operations before the rider repeats the checks and count.",
    });
    expect(body).toBe(
      "Did not pass: count against the order, free of visible defects. The rider wrote: “Twelve missing.” Fix it with Operations; the rider will check again.",
    );
    expect(presentCheckCodes("a person's note")).toBe("a person's note");
  });

  it("does not double the full stop when the rider ended the note with one", () => {
    const body = presentAlertBody({
      type: "shop_pickup_issue_changed",
      body: "visible_defects: Torn grommet.. Fix these items with Operations before the rider repeats the checks and count.",
    });
    expect(body).toContain("“Torn grommet.”");
    expect(body).not.toContain("..");
  });

  it("translates the codes of a notice in a shape it does not know", () => {
    expect(presentAlertBody({ type: "shop_pickup_issue_changed", body: "Pickup failed: documentation" })).toBe(
      "Pickup failed: the paperwork",
    );
  });

  it("places a pickup-issue alert at the pickup stage, not after delivery", () => {
    expect(
      stageForAlert(
        { id: "n", userId: "u", type: "shop_pickup_issue_changed", orderId: "ord_gone", title: "", body: "", read: false, at: "" },
        [],
      ),
    ).toBe(2);
  });
});
