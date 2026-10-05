import type { Href } from "expo-router";

import type { Notification } from "@/lib/api";
import {
  awaitsFirstApproval,
  isTakenDown,
  reviewNeeds,
  reviewsListings,
  TAKEN_DOWN_NOTE,
  type BoardContext,
  type BoardStanding,
  type Listing,
} from "@/lib/listings";

/**
 * Listing review and take-down, as far as a shop acts on them
 * (gridgo-api `docs/SUPPLIER_CATALOG_API.md`, listing review and take-down).
 *
 * The states themselves are `boardStanding` in `lib/listings.ts`. This module
 * decides what the listing editor offers at its foot, and rewrites the review
 * and take-down notices into the board's words.
 *
 * Three platform rules shape it. A listing no client has seen goes to
 * Operations before it reaches anyone, so its last step is Submit for review
 * rather than Put on the board. On an approved listing, changes to the price,
 * product type, specs, formats or photos go to Operations by themselves while
 * clients keep the approved version; words and times apply at once. And a
 * listing GRIDGO took down is GRIDGO's to restore: restoring hands it back
 * hidden, and the shop puts it up again with the ordinary switch.
 */

export type ListingFoot =
  /** GRIDGO took it down. Edits still save; the switch is not offered. */
  | { kind: "taken_down" }
  /**
   * Submit for review. `blocker` is the first thing it lacks, or null.
   * `firstApproval` means submitting also puts it up, since it is the
   * shop asking for it to be seen.
   */
  | { kind: "submit"; blocker: string | null; firstApproval: boolean; onTheBoard: boolean }
  /** Already with Operations for its first approval. Only saving is left. */
  | { kind: "in_review" }
  /** On the board: save, or take it off. */
  | { kind: "on_board" }
  /** Hidden with an approved version: put it on the board. */
  | { kind: "hidden" };

export function listingFoot(listing: Listing, context: BoardContext): ListingFoot {
  if (isTakenDown(listing)) return { kind: "taken_down" };
  if (reviewsListings(listing)) {
    const firstApproval = awaitsFirstApproval(listing);
    const needs = reviewNeeds(listing, context);
    if (firstApproval) {
      if (listing.reviewStatus === "needs_revision" || !listing.onTheBoard || needs.length) {
        return { kind: "submit", blocker: needs[0] ?? null, firstApproval, onTheBoard: listing.onTheBoard };
      }
      return { kind: "in_review" };
    }
    if (listing.reviewStatus === "needs_revision") {
      return { kind: "submit", blocker: needs[0] ?? null, firstApproval, onTheBoard: listing.onTheBoard };
    }
  }
  return listing.onTheBoard ? { kind: "on_board" } : { kind: "hidden" };
}

/** What the shop reads after a submission goes through. */
export const SUBMITTED_NOTICE =
  "Sent to Operations for review. Clients see it once it is approved, and you get an alert either way.";

/** "Taken down Oct 5, 2026, 9:55 PM". Null when GRIDGO sent no time. */
export function standingSince(prefix: string, iso: string | null | undefined): string | null {
  if (!iso) return null;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return null;
  const when = at.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  return `${prefix} ${when}`;
}

/** The preview's first line: whether a client sees this today, and why not. */
export function previewLine(standing: BoardStanding): string {
  switch (standing.kind) {
    case "live":
      return standing.revision
        ? "This is your latest version. Clients see the approved one until Operations approves these changes."
        : "This is what a client sees today.";
    case "suspended":
      return standing.reason
        ? `Taken down by GRIDGO, so no client can see this. ${reasonLine(standing.reason)}`
        : "Taken down by GRIDGO, so no client can see this.";
    case "needs_changes":
      return "Operations sent this back, so no client can see it yet. This is how it will read once it is approved.";
    case "pending_review":
      return "Operations is reviewing this, so no client can see it yet. This is how it will read once it is approved.";
    case "not_ready":
      return `No client can see this yet. ${standing.note ?? standing.label}`;
    case "hidden":
      return "No client can see this. It is hidden by you. This is how it would read once it is up.";
    case "waiting_approval":
      return "Operations has not approved your shop yet, so no client can see this. This is how it will read once they do.";
  }
}

/* --------------------------------------------------------------------------
   Alerts
   -------------------------------------------------------------------------- */

export const LISTING_SUSPENDED_ALERT = "listing_suspended";
export const LISTING_RESTORED_ALERT = "listing_restored";
const REVIEW_PENDING_ALERT = "catalog_review_pending";
const REVIEW_DECIDED_ALERT = "catalog_review_decided";
/** The body GRIDGO writes on a decision that carries no reason. */
const NO_REASON_BODY = "Open your listing to see its review status.";

function reasonLine(reason: string): string {
  return `Reason: ${reason.trim().replace(/[.!?]+$/, "")}.`;
}

/**
 * A review or take-down notice in the board's words, or null for any other
 * alert. GRIDGO's take-down body is the bare reason, and its review notices
 * are shared with Operations' own inbox, so neither reads right to a shop as sent.
 */
export function presentListingAlert(
  alert: Pick<Notification, "type" | "body">,
): { title: string; body: string } | null {
  const body = alert.body?.trim() ?? "";
  switch (alert.type) {
    case LISTING_SUSPENDED_ALERT:
      return {
        title: "Taken down by GRIDGO",
        body: body ? `${reasonLine(body)} ${TAKEN_DOWN_NOTE}` : TAKEN_DOWN_NOTE,
      };
    case LISTING_RESTORED_ALERT:
      return {
        title: "Take-down lifted",
        body: "GRIDGO restored your listing. It stays hidden until you put it back on the board.",
      };
    case REVIEW_PENDING_ALERT:
      return {
        title: "Sent for review",
        body: "Operations will check it before clients see it. You get an alert when they decide.",
      };
    case REVIEW_DECIDED_ALERT:
      return !body || body === NO_REASON_BODY
        ? {
            title: "Review finished",
            body: "Operations reviewed what you sent. Open your board to see where it stands.",
          }
        : { title: "Operations asked for changes", body: reasonLine(body) };
    default:
      return null;
  }
}

/** Where a review or take-down alert opens, or null for any other alert. */
export function listingAlertHref(
  alert: Pick<Notification, "type" | "catalogItemId">,
): Href | null {
  if (
    (alert.type === LISTING_SUSPENDED_ALERT || alert.type === LISTING_RESTORED_ALERT) &&
    alert.catalogItemId
  ) {
    return { pathname: "/shop/[id]", params: { id: alert.catalogItemId } };
  }
  if (
    alert.type === LISTING_SUSPENDED_ALERT ||
    alert.type === LISTING_RESTORED_ALERT ||
    alert.type === REVIEW_PENDING_ALERT ||
    alert.type === REVIEW_DECIDED_ALERT
  ) {
    return "/(tabs)/catalogues";
  }
  return null;
}
