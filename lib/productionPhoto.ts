import type { Order, ProductionProgress, ProductionProgressPhoto } from "@/lib/api";

/**
 * The production photo a job needs before it can be packed.
 *
 * GRIDGO refuses to let a shop mark a job packed or ready for pickup until the
 * job has one attached photo of the work (gridgo-api
 * `docs/OPERATIONAL_MODEL_V2_API.md#production-progress-photos`). The rule is
 * GRIDGO's, and so is the count: `productionProgress` says whether a photo is
 * on the job, and this module is the only place that reads it.
 *
 * Three things the screens are built on:
 *
 * - **One photo is enough.** A start-of-production proof filed as a picture
 *   already counts, so a shop that photographed the press to get paid has
 *   nothing more to do. A finished-work photo is welcome, never required.
 * - **A PDF never counts.** A proof filed as a document still earns its share,
 *   but it shows the client nothing, so it does not open packing.
 * - **An older GRIDGO says nothing.** Without `productionProgress` the phone
 *   cannot tell, so it does not guess a gate: the forward step stays, and a
 *   refusal (`isProductionPhotoRequired`) is what turns the photo step on.
 */

/** The states in which a job takes a progress photo, and in which packing is gated. */
export const PHOTO_STATES = ["production", "supplier_self_qc"] as const;

/** Stages whose proof, when it is a picture, GRIDGO also counts as the production photo. */
const PHOTO_PROOF_CODES = new Set(["production_started", "printing", "packaging_qc"]);

type ProgressOrder = Pick<Order, "state" | "productionProgress">;

/** True while the job may take a progress photo. */
export function takesProductionPhoto(order: Pick<Order, "state">): boolean {
  return (PHOTO_STATES as readonly string[]).includes(order.state);
}

/**
 * GRIDGO's progress record, read defensively, or null when this deployment
 * does not send one. A photo row without a file id is dropped: there is
 * nothing to draw and nothing to count.
 */
export function productionProgressOf(order: ProgressOrder): ProductionProgress | null {
  const raw = order.productionProgress;
  if (!raw || typeof raw !== "object") return null;
  const photos = Array.isArray(raw.photos)
    ? raw.photos.filter((photo): photo is ProductionProgressPhoto =>
        Boolean(photo && typeof photo.fileId === "string" && photo.fileId))
    : [];
  const status =
    raw.status === "photos_available" || raw.status === "waiting_for_photo"
      ? raw.status
      : photos.length
        ? "photos_available"
        : "waiting_for_photo";
  return { status, photos };
}

/**
 * Whether the job is standing at the packing gate without a photo.
 *
 * `refused` is a `production_photo_required` answer the screen already has in
 * hand, which is what speaks for an older GRIDGO that sends no record.
 */
export function needsProductionPhoto(order: ProgressOrder, refused = false): boolean {
  if (!takesProductionPhoto(order)) return false;
  const progress = productionProgressOf(order);
  if (progress) return progress.status === "waiting_for_photo";
  return refused;
}

export type ProgressPhotoView = {
  fileId: string;
  at: string | null;
  /** Set when this picture is also the shop's filed proof for a payout part. */
  proofOf: string | null;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
};

/**
 * The photos on the job, oldest first, each marked when it is a proof the
 * shop filed to get paid — that is how a shop sees its start photo being
 * reused rather than wondering whether it has to photograph the job twice.
 */
export function progressPhotoViews(
  order: ProgressOrder & Pick<Order, "payoutMilestones">,
): ProgressPhotoView[] {
  const progress = productionProgressOf(order);
  if (!progress) return [];
  const proofFor = new Map<string, string>();
  for (const stage of order.payoutMilestones ?? []) {
    if (!PHOTO_PROOF_CODES.has(stage.code)) continue;
    for (const fileId of stage.pofFileIds ?? []) proofFor.set(fileId, stage.code);
  }
  return progress.photos
    .map((photo) => ({
      fileId: photo.fileId,
      at: photo.at ?? null,
      proofOf: proofFor.get(photo.fileId) ?? null,
      downloadUrl: photo.downloadUrl ?? null,
      downloadUrlExpiresAt: photo.downloadUrlExpiresAt ?? null,
    }))
    .sort((a, b) => (Date.parse(a.at ?? "") || 0) - (Date.parse(b.at ?? "") || 0));
}

/**
 * A proof the shop filed for a photo stage that GRIDGO does not count as a
 * photo — a PDF, in practice. Named so the photo screen can say why the proof
 * the shop remembers filing is not opening packing.
 */
export function uncountedPhotoProof(
  order: ProgressOrder & Pick<Order, "payoutMilestones">,
): string | null {
  const progress = productionProgressOf(order);
  if (!progress) return null;
  const counted = new Set(progress.photos.map((photo) => photo.fileId));
  for (const stage of order.payoutMilestones ?? []) {
    if (!PHOTO_PROOF_CODES.has(stage.code)) continue;
    if ((stage.pofFileIds ?? []).some((fileId) => !counted.has(fileId))) return stage.code;
  }
  return null;
}

/** The brief row's one line: how many photos, or why none matters yet. */
export function progressPhotoSummary(order: ProgressOrder): { summary: string; empty: boolean } {
  const progress = productionProgressOf(order);
  const count = progress?.photos.length ?? 0;
  if (count) {
    return { summary: `${count} ${count === 1 ? "photo" : "photos"} · the client sees these`, empty: false };
  }
  if (takesProductionPhoto(order)) return { summary: "None yet · needed before packing", empty: true };
  return { summary: "No photo on this job", empty: true };
}

/** Whether the job workspace draws the progress row at all. */
export function showsProgressPhotos(order: ProgressOrder): boolean {
  const progress = productionProgressOf(order);
  if (!progress) return false;
  return progress.photos.length > 0 || takesProductionPhoto(order);
}
