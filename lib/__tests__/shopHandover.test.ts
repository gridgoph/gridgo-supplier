import type { Order } from "@/lib/api";
import {
  finishedStage,
  forcedSteps,
  handoverFlowOf,
  isForcedByGridgo,
  rejectedReviewMs,
  riderPacking,
  ridersPack,
  shopFinish,
} from "@/lib/shopHandover";

type Job = Pick<
  Order,
  "state" | "supplierId" | "riderId" | "handoverFlow" | "shopHandover" | "pickupChecklist" | "readyAt" | "forcedSteps" | "forcedByGridgo"
>;

function job(overrides: Partial<Job> = {}): Job {
  return {
    state: "production",
    supplierId: "shop_1",
    riderId: null,
    handoverFlow: "rider_packs",
    shopHandover: {},
    pickupChecklist: null,
    readyAt: null,
    ...overrides,
  };
}

const SENT = { at: "2026-10-15T02:00:00.000Z", by: "shop_1", supplierId: "shop_1", photoFileIds: ["f1", "f2"] };
const REJECTED = { at: "2026-10-15T04:00:00.000Z", by: "ops", decision: "rejected", note: "Reprint the two smudged copies" };

describe("handover flow", () => {
  it("is the one GRIDGO names, and legacy without a field", () => {
    expect(handoverFlowOf(job())).toBe("rider_packs");
    expect(handoverFlowOf(job({ handoverFlow: "legacy" }))).toBe("legacy");
    expect(handoverFlowOf(job({ handoverFlow: undefined }))).toBe("legacy");
    expect(ridersPack(null)).toBe(false);
  });
});

describe("finishedStage", () => {
  it("asks for the finished photos in production, with nothing to correct", () => {
    expect(finishedStage(job())).toEqual({ stage: "not_sent", correction: null });
  });

  it("carries GRIDGO's note after a review it sent back", () => {
    const stage = finishedStage(
      job({ shopHandover: { finished: null, review: REJECTED, attempts: [{ finished: SENT, review: REJECTED }] } }),
    );
    expect(stage).toEqual({
      stage: "not_sent",
      correction: { note: "Reprint the two smudged copies", at: REJECTED.at },
    });
  });

  it("does not hand a replacement shop another shop's correction", () => {
    const other = { ...SENT, supplierId: "shop_0" };
    expect(finishedStage(job({ shopHandover: { attempts: [{ finished: other, review: REJECTED }] } }))).toEqual({
      stage: "not_sent",
      correction: null,
    });
  });

  it("is in review while GRIDGO has not answered, then approved", () => {
    expect(finishedStage(job({ state: "supplier_self_qc", shopHandover: { finished: SENT, review: null } }))).toEqual({
      stage: "in_review",
      sentAt: SENT.at,
      photoCount: 2,
    });
    const approved = { at: "2026-10-15T03:00:00.000Z", by: "ops", decision: "approved", note: "" };
    expect(finishedStage(job({ state: "supplier_self_qc", shopHandover: { finished: SENT, review: approved } }))).toEqual({
      stage: "approved",
      sentAt: SENT.at,
      reviewedAt: approved.at,
    });
  });

  it("is GRIDGO's own step when it moved the job on with nothing sent", () => {
    expect(finishedStage(job({ state: "supplier_self_qc" }))).toEqual({ stage: "with_gridgo" });
  });

  it("says nothing for a legacy job or a job past production", () => {
    expect(finishedStage(job({ handoverFlow: "legacy" }))).toBeNull();
    expect(finishedStage(job({ state: "ready_for_dispatch" }))).toBeNull();
  });
});

describe("the shop's production clock", () => {
  it("stops at the submission and is paused while GRIDGO reviews", () => {
    expect(shopFinish(job({ state: "supplier_self_qc", shopHandover: { finished: SENT, review: null } }))).toEqual({
      at: SENT.at,
      pending: true,
    });
  });

  it("makes the submission the finish once approved", () => {
    const approved = { at: "2026-10-16T03:00:00.000Z", decision: "approved", note: "" };
    expect(shopFinish(job({ state: "supplier_self_qc", shopHandover: { finished: SENT, review: approved } }))).toEqual({
      at: SENT.at,
      pending: false,
    });
  });

  it("runs again after a review sent back, leaving that review out", () => {
    const sentBack = job({ shopHandover: { finished: null, review: REJECTED, attempts: [{ finished: SENT, review: REJECTED }] } });
    expect(shopFinish(sentBack)).toBeNull();
    expect(rejectedReviewMs(sentBack, Date.parse("2026-10-16T00:00:00.000Z"))).toBe(2 * 3_600_000);
    expect(rejectedReviewMs(job({ handoverFlow: "legacy", shopHandover: sentBack.shopHandover }), Date.now())).toBe(0);
  });
});

describe("riderPacking", () => {
  const assigned = { state: "rider_assigned", riderId: "rider_1" } as const;

  it("starts with the rider checking the unpacked products", () => {
    expect(riderPacking(job(assigned))).toEqual({ step: "check", arrivedPacked: false, checkedAt: null, packedAt: null });
  });

  it("says when the rider found the job already packed", () => {
    const counter = riderPacking(
      job({ ...assigned, shopHandover: { arrivedPacked: [{ at: "x", riderId: "rider_1", supplierId: "shop_1" }] } }),
    );
    expect(counter?.arrivedPacked).toBe(true);
  });

  it("moves to packing once the inspection passes, then to signing once the rider photographs it", () => {
    const inspected = {
      status: "inspected",
      inspectionId: "insp_2",
      completedAt: "2026-10-15T05:00:00.000Z",
    };
    expect(riderPacking(job({ ...assigned, pickupChecklist: inspected }))?.step).toBe("pack");
    // A packed photo from an earlier inspection does not count for this one.
    const stale = { packingPhotos: [{ at: "2026-10-15T04:00:00.000Z", fileId: "p0", inspectionId: "insp_1" }] };
    expect(riderPacking(job({ ...assigned, pickupChecklist: inspected, shopHandover: stale }))?.step).toBe("pack");
    const packed = { packingPhotos: [{ at: "2026-10-15T05:10:00.000Z", fileId: "p1", inspectionId: "insp_2" }] };
    expect(riderPacking(job({ ...assigned, pickupChecklist: inspected, shopHandover: packed }))).toEqual({
      step: "sign",
      arrivedPacked: false,
      checkedAt: inspected.completedAt,
      packedAt: "2026-10-15T05:10:00.000Z",
    });
  });

  it("leaves a failed check to the counter check panel, and a legacy job alone", () => {
    expect(riderPacking(job({ ...assigned, pickupChecklist: { status: "failed_escalated" } }))).toBeNull();
    expect(riderPacking(job({ ...assigned, handoverFlow: "legacy" }))).toBeNull();
  });
});

describe("forced by GRIDGO", () => {
  it("says the reason, the note and the skipped checks in words", () => {
    const order = job({
      forcedByGridgo: true,
      forcedSteps: [
        {
          at: "2026-10-15T06:00:00.000Z",
          by: "ops",
          role: "ops_admin",
          from: "production",
          to: "ready_for_dispatch",
          reasonCode: "evidence_verified_offline",
          note: "Inspected the finished work at the counter during the upload outage",
          skippedChecks: ["production_finished_required", "finished_product_photo_required", "production_review_required"],
        },
      ],
    });
    expect(isForcedByGridgo(order)).toBe(true);
    const [step] = forcedSteps(order);
    expect(step.reason).toBe("Checked in person");
    expect(step.note).toBe("Inspected the finished work at the counter during the upload outage");
    expect(step.skipped).toEqual(["Finished-product photos", "GRIDGO's review"]);
    expect(step.toPickup).toBe(true);
    expect(JSON.stringify(step)).not.toMatch(/_required|evidence_verified_offline/);
  });

  it("is only the tag when the detail is not sent", () => {
    expect(isForcedByGridgo(job({ forcedByGridgo: true }))).toBe(true);
    expect(forcedSteps(job({ forcedByGridgo: true }))).toEqual([]);
    expect(isForcedByGridgo(job())).toBe(false);
  });
});
