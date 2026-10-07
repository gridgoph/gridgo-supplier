import { needsPackingPhoto, packingPhotoViews } from "@/lib/packingPhoto";
import { actionsForJob, routeForAction } from "@/lib/jobState";
import { ApiError, isPackingPhotoRequired } from "@/lib/apiErrors";
const waiting = { status: "waiting_for_photo" as const, photos: [] };
const available = {
  status: "photos_available" as const,
  photos: [
    { fileId: "packed", contentType: "image/jpeg", at: "2026-10-07T00:00:00Z" },
  ],
};
it("requires separate packing evidence on both dispatch paths, but leaves old API and dispatched jobs alone", () => {
  for (const state of ["production", "supplier_self_qc"]) {
    const job = {
      state,
      productionProgress: available,
      packingProgress: waiting,
    };
    expect(needsPackingPhoto(job)).toBe(true);
    expect(actionsForJob(job)[0]).toMatchObject({
      kind: "add_packing_photo",
      targetState: null,
    });
    expect(actionsForJob({ ...job, packingProgress: available })[0].kind).toBe(
      "ready_for_pickup",
    );
  }
  expect(needsPackingPhoto({ state: "production" })).toBe(false);
  expect(needsPackingPhoto({ state: "production" }, true)).toBe(true);
  expect(
    needsPackingPhoto(
      { state: "production", packingProgress: available },
      true,
    ),
  ).toBe(false);
  expect(
    needsPackingPhoto(
      { state: "rider_assigned", packingProgress: waiting },
      true,
    ),
  ).toBe(false);
  expect(routeForAction("add_packing_photo")).toBe("/job/[id]/handoff");
});
it("preserves stopped work and production-photo priority", () => {
  const job = { state: "production", packingProgress: waiting };
  expect(actionsForJob({ ...job, refundHold: true })).toEqual([]);
  expect(actionsForJob({ ...job, productionProgress: waiting })[0].kind).toBe(
    "add_production_photo",
  );
});
it("reads packing photos without labelling them payout proof", () => {
  expect(packingPhotoViews({ packingProgress: available })[0]).toMatchObject({
    fileId: "packed",
    proofOf: null,
  });
  expect(packingPhotoViews({})).toEqual([]);
  expect(
    isPackingPhotoRequired(
      new ApiError(409, { error: "packing_photo_required" }),
    ),
  ).toBe(true);
});
