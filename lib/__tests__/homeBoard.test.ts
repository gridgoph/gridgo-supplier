import { buildObligations, greeting, homeHeadline } from "@/lib/homeBoard";
import type { MilestoneCode, Order, PayoutMilestone } from "@/lib/api";

const SHARES: Record<MilestoneCode, number> = {
  printing: 50,
  packaging_qc: 15,
  delivered: 25,
  retention: 10,
};

function milestones(
  overrides: Partial<Record<MilestoneCode, PayoutMilestone["status"]>> = {},
  supplierPriceMinor = 100000,
): PayoutMilestone[] {
  return (Object.keys(SHARES) as MilestoneCode[]).map((code) => ({
    code,
    sharePercent: SHARES[code],
    amountMinor: Math.round((supplierPriceMinor * SHARES[code]) / 100),
    status: overrides[code] ?? "pending_pof",
    pofFileIds: overrides[code] && overrides[code] !== "pending_pof" ? ["file_1"] : [],
    releasedAt: overrides[code] === "released" ? "2026-08-10T00:00:00.000Z" : null,
  }));
}

function job(partial: Partial<Order> & { id: string; state: string }): Order {
  return {
    clientId: "user_client",
    supplierId: "user_supplier",
    riderId: null,
    productId: "prod_1",
    title: `Job ${partial.id}`,
    quantity: 100,
    size: "A4",
    material: "Matte",
    deadline: null,
    address: "Davao City",
    zone: "davao",
    totalMinor: 112500,
    deliveryFeeMinor: 2500,
    paymentMethod: null,
    paymentStatus: "unpaid",
    promisedDate: null,
    artworkName: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    timeline: [],
    payoutMilestones: milestones(),
    ...partial,
  } as Order;
}

/** Every proof the shop owes on this job is already filed. */
function filed(partial: Partial<Order> & { id: string; state: string }): Order {
  return job({
    ...partial,
    payoutMilestones: milestones({ printing: "pof_attached", packaging_qc: "pof_attached" }),
  });
}

describe("the headline figure", () => {
  it("leads with money the shop can unstick itself", () => {
    const headline = homeHeadline([job({ id: "a", state: "production" })]);
    expect(headline.tone).toBe("at_risk");
    // In production both shop proofs are reachable and unfiled: 50% + 15%.
    expect(headline.amountMinor).toBe(65000);
    expect(headline.label).toMatch(/proof/i);
  });

  it("falls back to money with GRIDGO once every proof is filed", () => {
    const headline = homeHeadline([filed({ id: "a", state: "ready_for_dispatch" })]);
    expect(headline.tone).toBe("with_gridgo");
    // The two the shop filed. Delivery and retention are the rider's, and are
    // counted as later in the job rather than as money GRIDGO is sitting on.
    expect(headline.amountMinor).toBe(65000);
  });

  it("says a hold is a hold rather than calling it a review", () => {
    const headline = homeHeadline([
      filed({ id: "a", state: "issue_window_open", payoutHold: true }),
    ]);
    expect(headline.label).toMatch(/held/i);
    expect(headline.detail).toMatch(/reported a problem/i);
  });

  it("reports released money last, when nothing is stuck", () => {
    const headline = homeHeadline([
      job({
        id: "a",
        state: "payout_released",
        payoutMilestones: milestones({
          printing: "released",
          packaging_qc: "released",
          delivered: "released",
          retention: "released",
        }),
      }),
    ]);
    expect(headline.tone).toBe("released");
    expect(headline.amountMinor).toBe(100000);
  });

  it("tells a brand new shop what the figure will mean, not a bare zero", () => {
    const headline = homeHeadline([]);
    expect(headline.tone).toBe("none");
    expect(headline.amountMinor).toBe(0);
    expect(headline.detail).toMatch(/accept a job/i);
  });

  it("never names an internal state or code", () => {
    for (const jobs of [[], [job({ id: "a", state: "production" })]]) {
      const headline = homeHeadline(jobs);
      expect(`${headline.label} ${headline.detail}`).not.toMatch(/_/);
    }
  });
});

describe("the day's obligations", () => {
  const now = new Date("2026-08-11T08:00:00+08:00");

  /**
   * The captain's rule: a shop that walks a job forward without filing evidence
   * has worked unpaid, so evidence owed outranks everything else on the floor.
   */
  it("puts money sitting still ahead of a job that is merely running", () => {
    const list = buildObligations(
      [
        filed({ id: "just-running", state: "production", deadline: "2026-08-11T10:00:00+08:00" }),
        job({ id: "owes-proof", state: "supplier_self_qc", deadline: "2026-08-20T10:00:00+08:00" }),
      ],
      now,
    );
    expect(list.map((o) => o.orderId)).toEqual(["owes-proof", "just-running"]);
    expect(list[0].kind).toBe("proof");
  });

  it("ranks a decision above a production step, and orders each kind by date", () => {
    const list = buildObligations(
      [
        filed({ id: "produce", state: "production", deadline: "2026-08-11T09:00:00+08:00" }),
        filed({ id: "later", state: "supplier_assigned", deadline: "2026-08-20T10:00:00+08:00" }),
        filed({ id: "sooner", state: "supplier_assigned", deadline: "2026-08-12T10:00:00+08:00" }),
      ],
      now,
    );
    expect(list.map((o) => o.orderId)).toEqual(["sooner", "later", "produce"]);
  });

  it("keeps a staged pickup on the list even though it needs no action", () => {
    const list = buildObligations([filed({ id: "staged", state: "ready_for_dispatch" })], now);
    expect(list).toHaveLength(1);
    expect(list[0].kind).toBe("pickup");
    expect(list[0].route).toBe("/job/[id]");
    expect(list[0].actionKind).toBeUndefined();
  });

  it("says what a proof is worth, because that is what gets it taken", () => {
    const [obligation] = buildObligations([job({ id: "a", state: "production" })], now);
    expect(obligation.amountMinor).toBe(50000);
  });

  it("leaves out jobs waiting on somebody else entirely", () => {
    expect(
      buildObligations([filed({ id: "a", state: "awaiting_downpayment" })], now),
    ).toEqual([]);
  });

  it("marks a job past its promised time as late without relying on colour", () => {
    const [obligation] = buildObligations(
      [filed({ id: "a", state: "supplier_assigned", deadline: "2026-08-10T10:00:00+08:00" })],
      now,
    );
    expect(obligation.urgency).toBe("overdue");
    expect(obligation.detail).toMatch(/late by/i);
  });

  it("never puts a platform state string on a row", () => {
    const list = buildObligations(
      [
        job({ id: "a", state: "production" }),
        filed({ id: "b", state: "supplier_assigned" }),
        filed({ id: "c", state: "rider_assigned" }),
      ],
      now,
    );
    for (const obligation of list) {
      expect(`${obligation.detail} ${obligation.actionLabel} ${obligation.status.label}`).not.toMatch(
        /_/,
      );
    }
  });
});

describe("greeting", () => {
  it("uses the first name and the time of day", () => {
    expect(greeting("Ben Santos", new Date("2026-08-11T08:00:00"))).toBe("Good morning, Ben");
    expect(greeting("Ben Santos", new Date("2026-08-11T13:00:00"))).toBe("Good afternoon, Ben");
    expect(greeting("Ben Santos", new Date("2026-08-11T20:00:00"))).toBe("Good evening, Ben");
  });

  it("still greets an account with no name on it", () => {
    expect(greeting(undefined, new Date("2026-08-11T08:00:00"))).toBe("Good morning");
    expect(greeting("   ", new Date("2026-08-11T08:00:00"))).toBe("Good morning");
  });
});
