import type { CategoryRank, SupplierEnrollment } from "@/lib/api";
import { isPlaced } from "@/lib/shopLocation";
import type { SignupDraft } from "@/store/signupDraft";

/**
 * The draft a shop filled in, as the platform wants it.
 *
 * Ranking is the part worth being careful about. The captain's model is that a
 * shop declares what it does **best first**, so the order of the list *is* the
 * data: rank is position, and nothing else records it. The platform requires
 * ranks to run 1..n with no gaps, which a reorderable list gives for free.
 *
 * Field-level checking lives in `lib/onboardingSteps.ts`, next to the steps it
 * belongs to. This module only turns a complete draft into a request, and
 * refuses to invent a shop location when there is none — a pin at the origin of
 * the map would price every delivery from the Gulf of Guinea.
 */

export const MIN_PASSWORD_LENGTH = 8;

/** Position becomes rank: first in the list is what the shop does best. */
export function categoryRanks(categoryCodes: string[]): CategoryRank[] {
  return categoryCodes.map((categoryCode, index) => ({ categoryCode, rank: index + 1 }));
}

export function toEnrollRequest(draft: SignupDraft): SupplierEnrollment | null {
  if (!isPlaced(draft.pin)) return null;
  const label = draft.pin.label.trim();
  if (!label) return null;

  return {
    profile: {
      shopName: draft.shopName.trim(),
      contactName: draft.contactName.trim(),
      phone: draft.phone.trim(),
      location: { lat: draft.pin.lat, lng: draft.pin.lng, label },
    },
    serviceCategories: [...draft.categoryCodes],
  };
}

/** One key per draft so a retry is the same application, not a conflict. */
export function enrollmentIdempotencyKey(existing?: string): string {
  const key = existing?.trim() ?? "";
  if (key && key.length <= 200 && /^[A-Za-z0-9._:-]+$/.test(key)) return key;
  return `supplier-enroll-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Move a category one place towards "best". Ranks renumber themselves. */
export function promoteCategory(codes: string[], code: string): string[] {
  const index = codes.indexOf(code);
  if (index <= 0) return codes;
  const next = [...codes];
  [next[index - 1], next[index]] = [next[index], next[index - 1]];
  return next;
}

export function toggleCategory(codes: string[], code: string): string[] {
  return codes.includes(code) ? codes.filter((c) => c !== code) : [...codes, code];
}
