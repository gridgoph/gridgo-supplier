import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { isPhoneish } from "@/lib/onboardingSteps";

/**
 * The shop's own name, contact person and number — the record behind the
 * identity card on Account.
 *
 * Two of the four outcomes here are not failures, and both exist because of
 * something the shop cannot see from its counter.
 *
 * **Not open yet.** `/me/supplier-profile` is being added to GRIDGO in
 * parallel with this screen, so a 404 means either the route is not deployed
 * or the shop has no profile row behind it yet. Neither is the shop's doing
 * and neither is fixed by trying harder, so it is stated plainly rather than
 * shown as a red failure — the same pattern as `lib/verification.ts`.
 *
 * **Stale.** Every change carries the version it was read at, so GRIDGO
 * refuses a write built on details that have since moved: Operations
 * correcting a shop name while the owner is editing it is exactly the case
 * this catches. Treating that refusal as an ordinary failure would invite a
 * retry that puts the old name back, and treating it as success would hide
 * the change that was already there — so the conflict is its own outcome, and
 * the screen offers the latest instead of overwriting what it cannot see.
 */

/** The three details this app may change. Email is not one of them. */
export type ShopDetailField = "shopName" | "contactName" | "phone";

export type ShopProfileOutcome<T> =
  | { status: "ok"; value: T }
  | { status: "not_open_yet" }
  | { status: "stale" }
  /** `field` is set when GRIDGO named the one detail it would not accept. */
  | { status: "failed"; message: string; field?: ShopDetailField };

/**
 * What a shop is told while GRIDGO has no route for this. Names no status
 * code, and offers the way its details actually get corrected meanwhile.
 */
export const SHOP_DETAILS_NOT_OPEN_YET =
  "GRIDGO has not opened your shop details on this app yet. Nothing here is lost — check again shortly, and ask Operations to correct anything that cannot wait.";

/** The record moved under the shop. Says so, and what to do about it. */
export const SHOP_DETAILS_STALE =
  "Your shop details changed somewhere else while this screen was open. Load the latest so nothing you cannot see is overwritten, then make your change again.";

/** 404/405 mean the route is not there. Anything else is a real failure. */
function isRouteAbsent(error: unknown): boolean {
  return error instanceof api.ApiError && (error.status === 404 || error.status === 405);
}

/* --------------------------------------------------------------------------
   The draft on screen
   -------------------------------------------------------------------------- */

export type ShopDetailDraft = {
  shopName: string;
  contactName: string;
  phone: string;
};

/** A shop with no number on file edits an empty field, not the word "null". */
export function draftFromProfile(profile: api.SupplierProfile): ShopDetailDraft {
  return {
    shopName: profile.shopName,
    contactName: profile.contactName,
    phone: profile.phone ?? "",
  };
}

/**
 * Only what actually moved.
 *
 * A patch carrying every field would send GRIDGO a shop name the shop never
 * touched, which is the write that loses somebody else's correction even when
 * the version still matches.
 */
export function shopDetailPatch(
  profile: api.SupplierProfile,
  draft: ShopDetailDraft,
): api.SupplierProfilePatch {
  const patch: api.SupplierProfilePatch = {};
  const shopName = draft.shopName.trim();
  const contactName = draft.contactName.trim();
  const phone = draft.phone.trim();

  if (shopName !== profile.shopName) patch.shopName = shopName;
  if (contactName !== profile.contactName) patch.contactName = contactName;
  if (phone !== (profile.phone ?? "")) patch.phone = phone;
  return patch;
}

/** Whether there is anything to save. Nothing to save draws no action. */
export function hasShopDetailChanges(
  profile: api.SupplierProfile,
  draft: ShopDetailDraft,
): boolean {
  return Object.keys(shopDetailPatch(profile, draft)).length > 0;
}

/* --------------------------------------------------------------------------
   What is still wrong with it
   -------------------------------------------------------------------------- */

export type ShopDetailProblems = Partial<Record<ShopDetailField, string>>;

/**
 * The same three checks apply opened this account with, in the same words.
 *
 * A shop that is told one thing while applying and another while correcting
 * the same field learns that neither sentence means anything, so the wording
 * is shared with `shopStepProblems` deliberately — and the loose phone check
 * is imported rather than copied, because the platform is the authority and
 * this only catches a typo before it costs a round trip.
 */
export function shopDetailProblems(draft: ShopDetailDraft): ShopDetailProblems {
  const problems: ShopDetailProblems = {};
  if (!draft.shopName.trim()) {
    problems.shopName = "Enter the name clients and riders will see on your jobs.";
  }
  if (!draft.contactName.trim()) {
    problems.contactName = "Enter the name of the person GRIDGO should talk to.";
  }
  if (!isPhoneish(draft.phone)) {
    problems.phone = "Enter a mobile number GRIDGO and the rider can reach you on.";
  }
  return problems;
}

/**
 * GRIDGO's refusal, in this app's words rather than the server's.
 *
 * The platform sends its own `message` with these. It is not shown: a sentence
 * written for whoever is calling the API is not a sentence for a print shop,
 * and this is the one place that decides what a refusal reads like.
 */
const REFUSED: Record<ShopDetailField, string> = {
  shopName:
    "GRIDGO would not accept that shop name. Use the name clients and riders will see on your jobs.",
  contactName:
    "GRIDGO would not accept that name. Use the name of the person GRIDGO should talk to.",
  phone:
    "GRIDGO would not accept that mobile number. Enter one GRIDGO and the rider can reach you on.",
};

/** The one detail GRIDGO named when it refused the change, if it named one. */
function refusedField(error: unknown): ShopDetailField | null {
  if (!(error instanceof api.ApiError)) return null;
  const body = error.body;
  if (typeof body !== "object" || !body) return null;
  const record = body as Record<string, unknown>;
  if (record.error !== "invalid_supplier_profile") return null;
  const field = record.field;
  return field === "shopName" || field === "contactName" || field === "phone" ? field : null;
}

/* --------------------------------------------------------------------------
   The two calls
   -------------------------------------------------------------------------- */

export async function loadShopDetails(): Promise<ShopProfileOutcome<api.SupplierProfile>> {
  try {
    return { status: "ok", value: await api.getSupplierProfile() };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    return {
      status: "failed",
      message: humanizeApiError(error, offlineMessage("load your shop details")),
    };
  }
}

/**
 * Save the details that changed, against the version they were read at.
 *
 * A refusal naming one field comes back on that field, because "some of your
 * details are not valid" on a form of three leaves a shop retyping all three
 * to find out which.
 */
export async function saveShopDetails(
  version: number,
  patch: api.SupplierProfilePatch,
): Promise<ShopProfileOutcome<api.SupplierProfile>> {
  try {
    return { status: "ok", value: await api.updateSupplierProfile(version, patch) };
  } catch (error) {
    if (isRouteAbsent(error)) return { status: "not_open_yet" };
    if (error instanceof api.ApiError && error.status === 409) return { status: "stale" };

    const field = refusedField(error);
    if (field) return { status: "failed", message: REFUSED[field], field };

    return {
      status: "failed",
      message: humanizeApiError(error, offlineMessage("save your shop details")),
    };
  }
}
