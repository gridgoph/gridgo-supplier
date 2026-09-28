import type { Order, PayoutMilestone } from "@/lib/api";
import { ApiError, humanizeApiError, isProductionPhotoRequired, isProductionPhotoUploadNotAllowed } from "@/lib/apiErrors";
import { messageFor, uploadStageLabel, type UploadItem } from "@/lib/files";
import { actionsForJob, findAction, primaryAction, routeForAction } from "@/lib/jobState";
import { defaultBriefSection, workspaceBriefSections } from "@/lib/jobBrief";
import {
  needsProductionPhoto,
  productionProgressOf,
  progressPhotoSummary,
  progressPhotoViews,
  showsProgressPhotos,
  uncountedPhotoProof,
} from "@/lib/productionPhoto";
import { owedProductionMove } from "@/lib/productionNudge";
import { heldLink, rememberLink } from "@/lib/signedLinks";

type Progress = Order["productionProgress"];

const WAITING: Progress = { status: "waiting_for_photo", photos: [] };

function photos(...ids: string[]): Progress {
  return {
    status: "photos_available",
    photos: ids.map((fileId, index) => ({
      fileId,
      contentType: "image/jpeg",
      at: `2026-09-28T0${8 - index}:00:00.000Z`,
    })),
  };
}

/** Plan 2: the start photo is the shop's first proof. */
function escrow(start: Partial<PayoutMilestone> = {}): PayoutMilestone[] {
  return [
    {
      code: "production_started",
      label: "Start of production",
      releaseRequires: "shop_proof",
      sharePercent: 40,
      amountMinor: 40000,
      status: "pending_pof",
      pofFileIds: [],
      releasedAt: null,
      ...start,
    },
    {
      code: "delivered",
      label: "Delivered",
      releaseRequires: "delivery_proof",
      sharePercent: 35,
      amountMinor: 35000,
      status: "pending_pof",
      pofFileIds: [],
      releasedAt: null,
    },
  ];
}

function order(partial: Partial<Order> = {}): Pick<
  Order,
  "state" | "payoutMilestones" | "payoutHold" | "payoutPlanVersion" | "productionProgress"
> {
  return { state: "production", payoutPlanVersion: 2, payoutMilestones: [], payoutHold: false, ...partial };
}

describe("reading GRIDGO's production progress", () => {
  it("says nothing for an API older than the rule, and does not guess a gate", () => {
    expect(productionProgressOf(order())).toBeNull();
    expect(needsProductionPhoto(order())).toBe(false);
    expect(showsProgressPhotos(order())).toBe(false);
  });

  it("lets a packing refusal speak for an older API", () => {
    expect(needsProductionPhoto(order(), true)).toBe(true);
    // Past packing, a refusal about photos is not this job's business.
    expect(needsProductionPhoto(order({ state: "ready_for_dispatch" }), true)).toBe(false);
  });

  it.each(["production", "supplier_self_qc"])("gates packing at %s without a photo", (state) => {
    expect(needsProductionPhoto(order({ state, productionProgress: WAITING }))).toBe(true);
    expect(needsProductionPhoto(order({ state, productionProgress: photos("file_a") }))).toBe(false);
  });

  it("does not gate a job that already left production, even with none on record", () => {
    expect(needsProductionPhoto(order({ state: "ready_for_dispatch", productionProgress: WAITING }))).toBe(false);
  });

  it("drops photo rows without a file id and derives a missing status", () => {
    const progress = productionProgressOf(
      order({
        productionProgress: {
          photos: [{ fileId: "" }, { fileId: "file_a" }],
        } as unknown as Progress,
      }),
    );
    expect(progress).toEqual({ status: "photos_available", photos: [{ fileId: "file_a" }] });
  });

  it("orders the strip oldest first and marks a photo that is also the start proof", () => {
    const views = progressPhotoViews(
      order({
        productionProgress: photos("file_late", "file_start"),
        payoutMilestones: escrow({ status: "pof_attached", pofFileIds: ["file_start"] }),
      }),
    );
    expect(views.map((view) => [view.fileId, view.proofOf])).toEqual([
      ["file_start", "production_started"],
      ["file_late", null],
    ]);
  });

  it("names a start proof GRIDGO did not count as a photo — a PDF", () => {
    const pdf = order({
      productionProgress: WAITING,
      payoutMilestones: escrow({ status: "pof_attached", pofFileIds: ["file_pdf"] }),
    });
    expect(uncountedPhotoProof(pdf)).toBe("production_started");
    expect(uncountedPhotoProof(order({ productionProgress: WAITING, payoutMilestones: escrow() }))).toBeNull();
  });

  it("summarises the brief row in the shop's words", () => {
    expect(progressPhotoSummary(order({ productionProgress: WAITING }))).toEqual({
      summary: "None yet · needed before packing",
      empty: true,
    });
    expect(progressPhotoSummary(order({ productionProgress: photos("a", "b") })).summary).toBe(
      "2 photos · the client sees these",
    );
    expect(progressPhotoSummary(order({ state: "delivered", productionProgress: WAITING })).summary).toBe(
      "No photo on this job",
    );
  });
});

describe("the packing step waits on a photo", () => {
  it("replaces Package for pickup with the photo step until one is on the job", () => {
    const waiting = order({ productionProgress: WAITING, payoutMilestones: escrow({ status: "pof_attached", pofFileIds: ["file_pdf"] }) });
    expect(findAction(waiting, "ready_for_pickup")).toBeNull();
    const step = primaryAction(waiting);
    expect(step).toMatchObject({ kind: "add_production_photo", label: "Add a production photo", targetState: null });
    expect(routeForAction(step!.kind)).toBe("/job/[id]/progress-photo");
  });

  it("keeps the unfiled start proof first and says one photo does both", () => {
    const actions = actionsForJob(order({ productionProgress: WAITING, payoutMilestones: escrow() }));
    expect(actions.map((action) => [action.kind, action.primary])).toEqual([
      ["add_proof", true],
      ["add_production_photo", false],
    ]);
    expect(actions[0].consequence).toMatch(/also counts as the production photo/);
  });

  it("offers packing again once GRIDGO counts a photo, including the start proof", () => {
    const counted = order({
      productionProgress: photos("file_start"),
      payoutMilestones: escrow({ status: "pof_attached", pofFileIds: ["file_start"] }),
    });
    expect(primaryAction(counted)?.kind).toBe("ready_for_pickup");
    expect(actionsForJob(counted).some((action) => action.kind === "add_production_photo")).toBe(false);
  });

  it("keeps the forward step on an older API that sends no record", () => {
    expect(primaryAction(order())?.kind).toBe("ready_for_pickup");
  });

  it("tells the production nudge to photograph the job", () => {
    expect(owedProductionMove(order({ productionProgress: WAITING }))).toBe("Photograph the job so it can be packed");
  });

  it("draws the photo row in the workspace while the job takes photos, and after once there are some", () => {
    const base = {
      id: "ord_1",
      title: "Job",
      quantity: 1,
      size: "A4",
      material: "matte",
      riderId: null,
      address: "Davao",
      deadline: null,
      promisedDate: null,
      timeline: [],
    };
    const waiting = { ...base, ...order({ productionProgress: WAITING }) } as unknown as Order;
    expect(workspaceBriefSections(waiting)).toContain("progress");
    expect(defaultBriefSection(waiting)).toBe("make");
    const shipped = { ...base, ...order({ state: "delivered", productionProgress: photos("a") }) } as unknown as Order;
    expect(workspaceBriefSections(shipped)).toContain("progress");
    const bare = { ...base, ...order({ state: "delivered", productionProgress: WAITING }) } as unknown as Order;
    expect(workspaceBriefSections(bare)).not.toContain("progress");
  });
});

describe("the refusals, in words", () => {
  it("recognises the two photo refusals and never shows their codes", () => {
    const required = new ApiError(409, { error: "production_photo_required" });
    const late = new ApiError(409, { error: "production_photo_upload_not_allowed" });
    expect(isProductionPhotoRequired(required)).toBe(true);
    expect(isProductionPhotoRequired(late)).toBe(false);
    expect(isProductionPhotoUploadNotAllowed(late)).toBe(true);
    for (const error of [required, late]) {
      const message = humanizeApiError(error, "fallback");
      expect(message).not.toMatch(/_/);
      expect(message).not.toBe("fallback");
    }
    expect(humanizeApiError(required, "")).toMatch(/PDF does not/);
  });

  it("tells a shop a PDF is not a progress photo, while proof still takes one", () => {
    const refusal = { error: "purpose_media_type_not_allowed" };
    expect(messageFor(refusal, 415, "production_photo")).toMatch(/a PDF does not count/);
    expect(messageFor(refusal, 415, "fulfilment_proof")).toMatch(/JPEG, PNG, WebP or PDF/);
  });

  it("calls an attached progress photo on the job, not filed", () => {
    const item = { stage: "attached" } as UploadItem;
    expect(uploadStageLabel(item, "photo")).toBe("On the job");
    expect(uploadStageLabel(item)).toBe("Filed with GRIDGO");
  });
});

describe("links that arrive inside an order", () => {
  it("keeps a good link, never beyond the signing window, and never over one already held", () => {
    const now = Date.now();
    rememberLink("file_seed", "https://storage.test/a", new Date(now + 3_600_000).toISOString());
    const held = heldLink("file_seed");
    expect(held?.url).toBe("https://storage.test/a");
    expect(held!.expiresAt).toBeLessThanOrEqual(now + 300_000 + 1000);

    rememberLink("file_seed", "https://storage.test/b", new Date(now + 200_000).toISOString());
    expect(heldLink("file_seed")?.url).toBe("https://storage.test/a");
  });

  it("ignores a link that is already stale or has no expiry", () => {
    rememberLink("file_stale", "https://storage.test/c", new Date(Date.now() + 10_000).toISOString());
    rememberLink("file_undated", "https://storage.test/d", null);
    expect(heldLink("file_stale")).toBeNull();
    expect(heldLink("file_undated")).toBeNull();
  });
});
