import { ApiError, readRequirements, stepRefusal } from "@/lib/apiErrors";
import { actionsForJob, presentTimelineNote, type JobActionOrder } from "@/lib/jobState";
import { deliverySummary, jobDetailsOf } from "@/lib/jobBrief";
import { packagingCheck, packagingHeld } from "@/lib/packagingReadiness";
import type { Order } from "@/lib/api";

const PRODUCTION = "Attach at least one production progress photo before marking this job packed or ready for dispatch. A start-of-production photo counts.";
const PACKING = "Add a photo of the finished prints packed and ready before marking Ready for dispatch.";
const CLAIM = "This order cannot be packaged for pickup while a claim holds payouts. Operations must clear the claim first.";

const readiness = (missing: { code: string; message: string }[]) => ({
  ready_for_dispatch: { allowed: missing.length === 0, missing, receiptScan: { required: false, attached: false } },
});

describe("what GRIDGO needs before packaging (report 6C695C15)", () => {
  it("reads every missing item in GRIDGO's order and words, and ticks the photos it does not list", () => {
    const check = packagingCheck({
      state: "production",
      transitionReadiness: readiness([
        { code: "production_photo_required", message: PRODUCTION },
        { code: "packing_photo_required", message: PACKING },
      ]),
    });
    expect(check?.allowed).toBe(false);
    expect(check?.missing).toEqual([
      { kind: "production_photo", message: PRODUCTION },
      { kind: "packing_photo", message: PACKING },
    ]);
    expect(check?.steps.every((step) => !step.done)).toBe(true);
    expect(packagingHeld(check)).toBe(false);
  });

  it("holds the step for a claim, which only Operations can clear", () => {
    const check = packagingCheck({ state: "supplier_self_qc", transitionReadiness: readiness([{ code: "claim_hold_active", message: CLAIM }]) });
    expect(check?.steps.every((step) => step.done)).toBe(true);
    expect(packagingHeld(check)).toBe(true);
  });

  it("reads nothing from an older GRIDGO, or once the job has left the floor", () => {
    expect(packagingCheck({ state: "production" })).toBeNull();
    expect(packagingCheck({ state: "ready_for_dispatch", transitionReadiness: readiness([]) })).toBeNull();
    expect(packagingCheck({ state: "production", transitionReadiness: readiness([]) })?.allowed).toBe(true);
  });

  it("never shows a code: a message that is only a code gets this app's sentence instead", () => {
    expect(readRequirements([{ code: "claim_hold_active", message: "claim_hold_active" }])).toEqual([
      { kind: "claim", message: expect.stringContaining("Operations has to clear the claim") },
    ]);
    expect(readRequirements([{ code: "something_new", message: "" }])[0].message).not.toMatch(/_/);
    expect(readRequirements("nope")).toEqual([]);
  });

  it("offers no packaging step while a claim holds the job, and the photo step otherwise", () => {
    const base: JobActionOrder = {
      state: "production",
      productionProgress: { status: "photos_available", photos: [{ fileId: "f", at: null }] },
      packingProgress: { status: "photos_available", photos: [{ fileId: "p", at: null }] },
    };
    expect(actionsForJob({ ...base, transitionReadiness: readiness([]) }).map((a) => a.kind)).toEqual(["ready_for_pickup"]);
    expect(actionsForJob({ ...base, transitionReadiness: readiness([{ code: "claim_hold_active", message: CLAIM }]) })).toEqual([]);
  });
});

describe("a refused step, in GRIDGO's words", () => {
  it("keeps GRIDGO's sentence and every missing item", () => {
    const refusal = stepRefusal(
      new ApiError(409, {
        error: "production_photo_required",
        message: PRODUCTION,
        missing: [
          { code: "production_photo_required", message: PRODUCTION },
          { code: "claim_hold_active", message: CLAIM },
        ],
      }),
    );
    expect(refusal?.message).toBe(PRODUCTION);
    expect(refusal?.missing.map((item) => item.kind)).toEqual(["production_photo", "claim"]);
  });

  it("falls back to this app's sentence for an older GRIDGO, and leaves anything else to humanizeApiError", () => {
    expect(stepRefusal(new ApiError(409, { error: "claim_hold_active" }))?.message).toContain("claim");
    expect(stepRefusal(new ApiError(500, { error: "internal", message: "Something broke on the server." }))).toBeNull();
    expect(stepRefusal(new Error("network"))).toBeNull();
  });
});

describe("job details and update labels", () => {
  it("reads what GRIDGO filled and what it could not", () => {
    const details = jobDetailsOf({
      jobDetails: { material: "Not specified", zone: "Nearby", promisedDate: "2026-10-20T03:00:00.000Z", missing: ["material"] },
    });
    expect(details).toEqual(
      expect.objectContaining({ material: "Not specified", zone: "Nearby", promisedDate: "2026-10-20T03:00:00.000Z" }),
    );
    expect(jobDetailsOf({})).toBeNull();
    expect(jobDetailsOf({ jobDetails: { material: "x", zone: "y", promisedDate: "Not specified", missing: ["promisedDate"] } })?.promisedDate).toBeNull();
  });

  it("adds the zone to the closed delivery row", () => {
    const order = {
      readyBy: null,
      promisedDate: null,
      deadline: null,
      jobDetails: { material: "Vinyl", zone: "Away", promisedDate: "2026-10-20T03:00:00.000Z", missing: [] },
    } as unknown as Order;
    expect(deliverySummary(order as Parameters<typeof deliverySummary>[0])).toMatch(/^Ready by .* · Away$/);
  });

  it("never shows an internal payout label in an update", () => {
    expect(presentTimelineNote("Proof filed for production_started")).toBe("Proof filed for Start of production");
    expect(presentTimelineNote("Printing started")).toBe("Printing started");
  });
});

describe("the newer handover's checklist (docs/SHOP_HANDOVER_API.md)", () => {
  const FINISHED = "Submit photos of the finished, unpacked products for GRIDGO review first.";
  const REVIEW = "Wait for GRIDGO to approve the finished-product photos before calling a rider. Do not pack yet.";

  it("lists the finished photos and GRIDGO's review instead of the two photos", () => {
    const check = packagingCheck({
      state: "production",
      handoverFlow: "rider_packs",
      transitionReadiness: readiness([
        { code: "production_finished_required", message: FINISHED },
        { code: "production_review_required", message: REVIEW },
      ]),
    });
    expect(check?.flow).toBe("rider_packs");
    expect(check?.steps).toEqual([
      { kind: "finished_photos", done: false },
      { kind: "review", done: false },
    ]);
    // Neither is a hold: both are the shop's ordinary way to a rider.
    expect(packagingHeld(check)).toBe(false);
  });

  it("ticks the photos once sent and still holds for a claim", () => {
    const check = packagingCheck({
      state: "supplier_self_qc",
      handoverFlow: "rider_packs",
      transitionReadiness: readiness([
        { code: "production_review_required", message: REVIEW },
        { code: "claim_hold_active", message: CLAIM },
      ]),
    });
    expect(check?.steps).toEqual([
      { kind: "finished_photos", done: true },
      { kind: "review", done: false },
    ]);
    expect(packagingHeld(check)).toBe(true);
  });

  it("keeps the two photos on a legacy job", () => {
    const check = packagingCheck({ state: "production", transitionReadiness: readiness([]) });
    expect(check?.steps.map((step) => step.kind)).toEqual(["production_photo", "packing_photo"]);
  });
});
