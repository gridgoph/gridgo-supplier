import type { Order } from "@/lib/api";
import { ApiError, isReceiptScanRequired, stepRefusal } from "@/lib/apiErrors";
import { actionsForJob, routeForAction, type JobActionOrder } from "@/lib/jobState";
import { packagingCheck, packagingHeld } from "@/lib/packagingReadiness";
import { owesReceiptScan, receiptScanOf } from "@/lib/receiptScan";
import { forcedSteps } from "@/lib/shopHandover";

const SCAN_NEEDED =
  "Scan or upload this order's shop invoice or receipt and attach it before calling a rider. GRIDGO needs the scan before dispatch.";

function readiness(scan: { required: boolean; attached: boolean }): Order["transitionReadiness"] {
  const missing = scan.required && !scan.attached ? [{ code: "receipt_scan_required", message: SCAN_NEEDED }] : [];
  return { ready_for_dispatch: { allowed: missing.length === 0, missing, receiptScan: scan } };
}

const legacy: JobActionOrder = {
  state: "production",
  payoutMilestones: [],
  productionProgress: { status: "photos_available", photos: [{ fileId: "p1", contentType: "image/jpeg" }] },
  packingProgress: { status: "photos_available", photos: [{ fileId: "packed", contentType: "image/jpeg" }] },
} as JobActionOrder;

describe("receiptScanOf", () => {
  it("reads GRIDGO's answer only on the shop's floor", () => {
    expect(receiptScanOf({ state: "production", transitionReadiness: readiness({ required: true, attached: false }) })).toEqual({
      required: true,
      attached: false,
    });
    expect(receiptScanOf({ state: "ready_for_dispatch", transitionReadiness: readiness({ required: true, attached: false }) })).toBeNull();
    expect(receiptScanOf({ state: "production", transitionReadiness: { ready_for_dispatch: { allowed: true, missing: [] } } })).toBeNull();
  });

  it("owes a scan only when required and not attached", () => {
    expect(owesReceiptScan({ state: "production", transitionReadiness: readiness({ required: false, attached: false }) })).toBe(false);
    expect(owesReceiptScan({ state: "production", transitionReadiness: readiness({ required: true, attached: true }) })).toBe(false);
    expect(owesReceiptScan({ state: "production", transitionReadiness: readiness({ required: true, attached: false }) })).toBe(true);
  });
});

describe("the step on the job", () => {
  it("offers dispatch as before while the switch is off", () => {
    const actions = actionsForJob({ ...legacy, transitionReadiness: readiness({ required: false, attached: false }) });
    expect(actions.map((a) => a.kind)).toEqual(["ready_for_pickup"]);
  });

  it("puts the scan in place of dispatch while it is owed, on the handover screen", () => {
    const [step] = actionsForJob({ ...legacy, transitionReadiness: readiness({ required: true, attached: false }) });
    expect(step).toMatchObject({ kind: "add_receipt_scan", label: "Add receipt scan", targetState: null, primary: true });
    expect(routeForAction("add_receipt_scan")).toBe("/job/[id]/handoff");
  });

  it("gives dispatch back once the scan is attached", () => {
    const actions = actionsForJob({ ...legacy, transitionReadiness: readiness({ required: true, attached: true }) });
    expect(actions.map((a) => a.kind)).toEqual(["ready_for_pickup"]);
  });

  it("does the same on the newer handover after GRIDGO's review", () => {
    const newer = {
      ...legacy,
      supplierId: "shop",
      state: "supplier_self_qc",
      handoverFlow: "rider_packs",
      shopHandover: {
        finished: { at: "2026-10-15T02:00:00.000Z", supplierId: "shop", photoFileIds: ["f1"] },
        review: { at: "2026-10-15T03:00:00.000Z", decision: "approved", note: "" },
      },
    } as JobActionOrder;
    expect(actionsForJob({ ...newer, transitionReadiness: readiness({ required: true, attached: false }) })[0].kind).toBe(
      "add_receipt_scan",
    );
    expect(actionsForJob({ ...newer, transitionReadiness: readiness({ required: true, attached: true }) })[0].kind).toBe(
      "ready_for_pickup",
    );
  });
});

describe("the packaging checklist", () => {
  it("counts a missing scan as the shop's own step, never a hold", () => {
    const check = packagingCheck({ state: "production", transitionReadiness: readiness({ required: true, attached: false }) });
    expect(check).toMatchObject({ allowed: false, receiptRequired: true, receiptAttached: false });
    expect(check?.missing).toEqual([{ kind: "receipt_scan", message: SCAN_NEEDED }]);
    expect(packagingHeld(check)).toBe(false);
  });

  it("names the scan GRIDGO's forced step skipped", () => {
    const [step] = forcedSteps({
      forcedByGridgo: true,
      forcedSteps: [
        {
          at: "2026-11-02T03:00:00.000Z",
          from: "production",
          to: "ready_for_dispatch",
          reasonCode: "technical_issue",
          note: "Shop scanner broken",
          skippedChecks: ["receipt_scan_required"],
        },
      ],
    } as Pick<Order, "forcedSteps" | "forcedByGridgo">);
    expect(step.skipped).toEqual(["Receipt scan"]);
  });
});

describe("GRIDGO's refusal", () => {
  it("is recognised and said in GRIDGO's words, falling back to the same sentence", () => {
    const refused = new ApiError(409, { error: "receipt_scan_required", message: SCAN_NEEDED });
    expect(isReceiptScanRequired(refused)).toBe(true);
    expect(stepRefusal(refused)?.message).toBe(SCAN_NEEDED);
    const bare = new ApiError(409, { error: "receipt_scan_required" });
    expect(stepRefusal(bare)?.message).toBe(SCAN_NEEDED);
    expect(isReceiptScanRequired(new ApiError(409, { error: "packing_photo_required" }))).toBe(false);
  });
});
