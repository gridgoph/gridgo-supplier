import type { Order } from "@/lib/api";
import { actionsForJob, presentJobStatus, primaryAction } from "@/lib/jobState";
import { expressReadyNow } from "@/lib/packagingReadiness";
import { progressPhotoSummary, showsProgressPhotos } from "@/lib/productionPhoto";
import { expressReadyPhotoStep, expressReadySteps, quickAction } from "@/lib/todo";

import ownerRead from "./fixtures/expressProductionOwner.json";
import staffRead from "./fixtures/expressProductionStaff.json";

/**
 * An Express document job reopened while already in production
 * (gridgo-supplier#269, gridgo-api `docs/EXPRESS_API.md` "It's ready").
 *
 * The fixtures are real `GET /orders/:id` reads from the PR 419 API, as Owner
 * and as Staff, of a job accepted and put on the press whose ready request
 * never landed. They still carry the ordinary newer-handover fields
 * (`handoverFlow: "rider_packs"`, an empty `shopHandover`, a production photo
 * "waiting"), and GRIDGO's readiness says ready is allowed. Only identifying
 * text was scrubbed. The app must follow the readiness, not the photo stages.
 */
const NOW = new Date("2026-11-21T17:45:00.000Z");
const owner = ownerRead as unknown as Order;
const staff = staffRead as unknown as Order;

const READS = [
  ["Owner", owner],
  ["Staff", staff],
] as const;

const kinds = (order: Order) => actionsForJob(order, NOW).map((a) => a.kind);

describe.each(READS)("a reopened Express job in production, read as %s", (_who, read) => {
  it("is the API shape that used to ask for finished photos", () => {
    expect(read.state).toBe("production");
    expect(read.handoverFlow).toBe("rider_packs");
    expect(read.shopHandover).toEqual({});
    expect(read.transitionReadiness?.ready_for_dispatch).toMatchObject({ allowed: true, missing: [] });
  });

  it("offers the ready step and no photo step", () => {
    expect(expressReadyNow(read)).toBe(true);
    expect(kinds(read)).toContain("ready_for_pickup");
    expect(kinds(read)).not.toContain("send_finished_photos");
    expect(kinds(read)).not.toContain("add_production_photo");
    const ready = actionsForJob(read, NOW).find((a) => a.kind === "ready_for_pickup");
    expect(ready).toMatchObject({ label: "Ready for the client", targetState: "ready_for_dispatch" });
  });

  it("It's ready sends ready on its own, with no photo screen to open", () => {
    expect(expressReadySteps(read, NOW)).toEqual(["ready_for_dispatch"]);
    expect(expressReadyPhotoStep(read, NOW)).toBeNull();
  });

  it("reads as in production, not under GRIDGO's review", () => {
    expect(presentJobStatus(read).label).toBe("In production");
  });

  it("does not say a production photo is needed", () => {
    expect(showsProgressPhotos(read)).toBe(false);
    expect(progressPhotoSummary(read).summary).not.toContain("needed before packing");
  });

  it("takes ready from the older packaging state too", () => {
    const qc = { ...read, state: "supplier_self_qc" } as Order;
    expect(expressReadySteps(qc, NOW)).toEqual(["ready_for_dispatch"]);
    expect(presentJobStatus(qc).label).not.toBe("GRIDGO reviewing");
  });

  it("offers nothing while GRIDGO holds the job for a claim", () => {
    const held = {
      ...read,
      transitionReadiness: {
        ...read.transitionReadiness,
        ready_for_dispatch: {
          allowed: false,
          missing: [{ code: "claim_hold_active", message: "A client claim is open on this order." }],
          receiptScan: { required: false, attached: false },
        },
      },
    } as unknown as Order;
    expect(expressReadyNow(held)).toBe(false);
    expect(kinds(held)).not.toContain("ready_for_pickup");
    expect(expressReadySteps(held, NOW)).toEqual([]);
  });

  it("keeps the ordinary steps on a GRIDGO too old to send readiness", () => {
    const older = { ...read, transitionReadiness: null } as Order;
    expect(expressReadyNow(older)).toBe(false);
    expect(kinds(older)).toContain("send_finished_photos");
  });
});

describe("the Owner's read", () => {
  it("keeps the start-of-production proof first, with ready still on the job", () => {
    // Plan 2: the shop's first share waits on a photo; ready is demoted, not removed.
    expect(primaryAction(owner, NOW)?.kind).toBe("add_proof");
    expect(primaryAction(owner, NOW)?.consequence).not.toContain("before packing");
    expect(kinds(owner)).toContain("ready_for_pickup");
  });
});

describe("the Staff read", () => {
  it("carries no money and still gets ready as its step", () => {
    const keys = Object.keys(staffRead);
    expect(keys.filter((key) => /minor|payout|earnings|commission/i.test(key))).toEqual([]);
    expect(primaryAction(staff, NOW)?.kind).toBe("ready_for_pickup");
    expect(quickAction(staff, NOW)?.label).toBe("Ready");
  });

  it("says how the client paid from the allowlisted method", () => {
    expect(staff.paymentMethod).toBe("qr_manual");
  });
});

describe("regular jobs keep their photo and review gates", () => {
  // The same read without the Express order type: GRIDGO would want finished
  // photos and its review, and says so.
  const regular = {
    ...owner,
    orderType: undefined,
    expressOrder: undefined,
    transitionReadiness: {
      ready_for_dispatch: {
        allowed: false,
        missing: [
          { code: "finished_product_photo_required", message: "Send photos of the finished products." },
          { code: "production_review_required", message: "GRIDGO reviews them first." },
        ],
        receiptScan: { required: false, attached: false },
      },
    },
  } as unknown as Order;

  it("asks for finished photos, not ready", () => {
    expect(expressReadyNow(regular)).toBe(false);
    expect(progressPhotoSummary(regular).summary).toBe("None yet · needed before packing");
    expect(kinds(regular)).toContain("send_finished_photos");
    expect(kinds(regular)).not.toContain("ready_for_pickup");
  });

  it("does not skip its photos even if a read claimed it could go ready", () => {
    const optimistic = {
      ...regular,
      transitionReadiness: { ready_for_dispatch: { allowed: true, missing: [], receiptScan: { required: false, attached: false } } },
    } as unknown as Order;
    expect(kinds(optimistic)).toContain("send_finished_photos");
    expect(kinds(optimistic)).not.toContain("ready_for_pickup");
  });
});
