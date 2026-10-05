import type { Order } from "@/lib/api";
import {
  CANCEL_REASONS,
  cancelNeedsDetail,
  cancelReasonText,
  canCancelJob,
  failureReason,
  failureStageLabel,
  normalizeShopFailures,
  presentShopRecoveryAlert,
  shopRelease,
} from "@/lib/shopRecovery";

type ReleaseOrder = Pick<Order, "state" | "shopAcceptance" | "shopRecovery">;

function released(
  kind: "timed_out" | "declined" | "cancelled",
  status: NonNullable<Order["shopRecovery"]>["status"],
  state = "production",
): ReleaseOrder {
  return {
    state,
    shopAcceptance: {
      assignedAt: "2026-10-05T06:00:00.000Z",
      deadlineAt: "2026-10-05T07:00:00.000Z",
      workingMinutes: 60,
      status: kind,
    },
    shopRecovery: { id: "shop_event_1", status },
  };
}

describe("a job the shop let go", () => {
  it("is still the shop's job until something released it", () => {
    expect(shopRelease({ state: "production", shopAcceptance: null, shopRecovery: null })).toBeNull();
  });

  it("belongs to the replacement shop once the client accepted one", () => {
    expect(shopRelease(released("declined", "accepted"))).toBeNull();
  });

  it.each([
    ["timed_out", "Not answered in time", "The hour to answer ran out"],
    ["declined", "Passed on", "You passed on this job"],
    ["cancelled", "Cancelled by you", "You cancelled this job"],
  ] as const)("names a %s job in the shop's words", (kind, chip, title) => {
    const release = shopRelease(released(kind, "awaiting_client"));
    expect(release?.chip.label).toBe(chip);
    expect(release?.title).toBe(title);
    expect(release?.body).toMatch(/another vetted shop or a full refund/);
  });

  it("says Operations has it when the client cannot simply be re-matched", () => {
    expect(shopRelease(released("cancelled", "ops_review"))?.body).toMatch(/Operations/);
  });

  it.each(["refund_requested", "refunded"] as const)("says the client chose a refund (%s)", (status) => {
    expect(shopRelease(released("cancelled", status))?.body).toMatch(/full refund/);
  });

  it("falls back on the state when the acceptance record is missing", () => {
    expect(
      shopRelease({ state: "supplier_assigned", shopAcceptance: null, shopRecovery: { id: "e", status: "awaiting_client" } })
        ?.kind,
    ).toBe("declined");
    expect(
      shopRelease({ state: "production", shopAcceptance: null, shopRecovery: { id: "e", status: "awaiting_client" } })?.kind,
    ).toBe("cancelled");
  });
});

describe("cancelling an accepted job", () => {
  const base = { shopRecovery: null, refundHold: false, refundDisposition: null, rescheduleRequest: null };

  it.each(["payment_authorized", "production", "supplier_self_qc", "ready_for_dispatch", "rider_assigned"])(
    "is offered at %s",
    (state) => {
      expect(canCancelJob({ ...base, state })).toBe(true);
    },
  );

  it.each(["supplier_assigned", "picked_up", "delivered", "completed"])("is not offered at %s", (state) => {
    expect(canCancelJob({ ...base, state })).toBe(false);
  });

  it("is not offered once the job is already released, refunded or paused", () => {
    expect(canCancelJob({ ...base, state: "production", shopRecovery: { id: "e", status: "awaiting_client" } })).toBe(false);
    expect(canCancelJob({ ...base, state: "production", refundHold: true })).toBe(false);
    expect(
      canCancelJob({
        ...base,
        state: "production",
        rescheduleRequest: {
          id: "r",
          orderId: "o",
          reason: "",
          status: "declined",
          requestedAt: "",
          expiresAt: "",
          answeredAt: null,
          resolution: "rematch_offered",
          workHeld: true,
          originalReadyBy: "",
          proposedReadyBy: "",
        },
      }),
    ).toBe(false);
  });

  it("requires the shop's own words for 'Something else'", () => {
    expect(cancelNeedsDetail("other")).toBe(true);
    expect(cancelNeedsDetail("machine_down")).toBe(false);
    expect(cancelReasonText("other", "  Power cut all week ")).toBe("Power cut all week");
    expect(cancelReasonText("machine_down", "")).toBe("A machine broke down");
    expect(cancelReasonText("machine_down", "Laminator, until Thursday")).toBe(
      "A machine broke down. Laminator, until Thursday",
    );
    expect(CANCEL_REASONS.map((r) => r.id)).toContain("other");
  });
});

describe("the shop's record of jobs it let go", () => {
  it("reads GRIDGO's events newest first and drops what it cannot read", () => {
    const failures = normalizeShopFailures({
      events: [
        { id: "e1", orderId: "o1", kind: "declined", stage: "supplier_assigned", reason: "Press down", at: "2026-10-01T00:00:00Z" },
        { id: "e2", orderId: "o2", kind: "cancelled", stage: "production", reason: "Out of vinyl", at: "2026-10-03T00:00:00Z" },
        { id: "e3", orderId: "o3", kind: "timed_out", stage: "supplier_assigned", reason: "No response within one opening hour.", at: "2026-10-02T00:00:00Z" },
        { id: "e4", orderId: "o4", kind: "exploded", at: "2026-10-02T00:00:00Z" },
        "nonsense",
      ],
    });
    expect(failures?.map((f) => f.id)).toEqual(["e2", "e3", "e1"]);
    expect(normalizeShopFailures({ nope: true })).toBeNull();
  });

  it("repeats the shop's own reason, never GRIDGO's for a timed-out job", () => {
    const [cancelled, timedOut] = normalizeShopFailures({
      events: [
        { id: "a", orderId: "o", kind: "cancelled", stage: "production", reason: "Out of vinyl", at: "2026-10-03T00:00:00Z" },
        { id: "b", orderId: "o", kind: "timed_out", stage: "supplier_assigned", reason: "No response within one opening hour.", at: "2026-10-02T00:00:00Z" },
      ],
    })!;
    expect(failureReason(cancelled)).toBe("Out of vinyl");
    expect(failureReason(timedOut)).toBeNull();
  });

  it("says the stage in words", () => {
    expect(failureStageLabel("supplier_assigned")).toBe("Before accepting");
    expect(failureStageLabel("production")).toBe("During production");
    expect(failureStageLabel("rider_assigned")).toBe("Rider on the way");
    expect(failureStageLabel("whatever")).toBe("Before pickup");
  });
});

describe("recovery notices", () => {
  it("ignores other alerts", () => {
    expect(presentShopRecoveryAlert({ type: "shop_job_assigned", body: "x" })).toBeNull();
  });

  it.each([
    "The original shop could not fulfil your order. A vetted replacement is available. Accept the revised date or choose a full refund.",
    "The original shop could not fulfil your order. No replacement is available. You can choose a full refund.",
    "The client accepted a replacement match.",
    "The client chose a full refund. Operations will arrange the transfer.",
    "The shop cannot fulfil this order. Operations is reviewing the next step.",
  ])("never hands the shop the client's words: %s", (body) => {
    const alert = presentShopRecoveryAlert({ type: "shop_recovery", body });
    expect(alert).not.toBeNull();
    expect(alert!.body).not.toMatch(/original shop|your order/i);
  });
});
