import type { Order } from "@/lib/api";
import type { ProgressPhotoView } from "@/lib/productionPhoto";

type PackingOrder = Pick<Order, "state" | "packingProgress">;

/** The server owns the gate; a refusal covers an older response without the field. */
export function needsPackingPhoto(
  order: PackingOrder,
  refused = false,
): boolean {
  if (!["production", "supplier_self_qc"].includes(order.state)) return false;
  return order.packingProgress
    ? order.packingProgress.status === "waiting_for_photo"
    : refused;
}

export function packingPhotoViews(
  order: Pick<Order, "packingProgress">,
): ProgressPhotoView[] {
  const photos = order.packingProgress?.photos;
  if (!Array.isArray(photos)) return [];
  return photos
    .filter(
      (photo) => photo && typeof photo.fileId === "string" && photo.fileId,
    )
    .map((photo) => ({
      fileId: photo.fileId,
      at: photo.at ?? null,
      proofOf: null,
      downloadUrl: photo.downloadUrl ?? null,
      downloadUrlExpiresAt: photo.downloadUrlExpiresAt ?? null,
    }));
}
