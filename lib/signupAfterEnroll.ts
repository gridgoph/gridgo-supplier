import { cacheDirectory, downloadAsync } from "expo-file-system/legacy";
import { Platform } from "react-native";

import * as api from "@/lib/api";
import { newUploadItem, uploadFile, type UploadItem } from "@/lib/files";
import { normalizeListings } from "@/lib/listings";
import type { PickedDocument } from "@/store/signupDraft";

/**
 * What guided sign-up finishes by itself once the shop exists
 * (gridgo-api `docs/SUPPLIER_SIGNUP_API.md`, "Enroll once").
 *
 * Every generated document listing needs a sample photo before Operations
 * can review it, and a new document shop has nothing to photograph yet. So
 * GRIDGO hands one unbranded sample picture, and it is uploaded **once per
 * listing** — each listing must own its own file. Listing review still checks
 * them; nothing here bypasses it.
 *
 * Quiet on purpose: a sample that does not upload now is tried again the next
 * time the setup map opens (GRIDGO's `nextStep` stays `listing_photos`), and a
 * logo is optional. Neither is ever a red failure in front of the shop.
 */

async function sampleItem(key: string): Promise<UploadItem | null> {
  const { url, token } = await api.guidedSignupSampleUrl();
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}`, "X-GRIDGO-Role": "supplier" };
  if (Platform.OS === "web") {
    const response = await fetch(url, { headers });
    if (!response.ok) return null;
    const blob = await response.blob();
    const file = new File([blob], "document-sample.png", { type: "image/png" });
    return newUploadItem({ key, uri: url, fileName: file.name, mimeType: "image/png", sizeBytes: file.size, file });
  }
  const target = `${cacheDirectory ?? ""}gridgo-document-sample.png`;
  const downloaded = await downloadAsync(url, target, { headers });
  if (downloaded.status !== 200) return null;
  return newUploadItem({ key, uri: downloaded.uri, fileName: "document-sample.png", mimeType: "image/png", sizeBytes: null });
}

/** Give each listing without a photo GRIDGO's sample. Returns how many were given one. */
export async function addSamplePhotos(): Promise<number> {
  let listings;
  try {
    listings = normalizeListings(await api.listCatalogItems({ limit: 50 }));
  } catch {
    return 0;
  }
  const bare = listings.filter((listing) => !listing.photos.length);
  let added = 0;
  for (const listing of bare) {
    try {
      const item = await sampleItem(`sample-${listing.id}`);
      if (!item) break;
      const uploaded = await uploadFile(item, "catalog_item_photo", () => {});
      if (!uploaded.ok) continue;
      await api.attachCatalogItemPhoto(uploaded.fileId, listing.id, 0);
      added += 1;
    } catch {
      // Tried again on the next visit to the setup map.
    }
  }
  return added;
}

/** The logo picked during sign-up, attached once the shop can own it. */
export async function attachSignupLogo(logo: PickedDocument | null | undefined): Promise<boolean> {
  if (!logo) return false;
  try {
    const uploaded = await uploadFile(newUploadItem({ key: "signup-logo", ...logo }), "supplier_shop_image", () => {});
    if (!uploaded.ok) return false;
    await api.attachShopLogo(uploaded.fileId);
    return true;
  } catch {
    return false;
  }
}
