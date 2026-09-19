import type { MyReviews, ReviewStats } from "@/lib/api";

/**
 * Reading a review score back to a shop.
 *
 * Numbers alone are a rating nobody can read: 4.2 says nothing about whether
 * 4.2 is good here. So every average has a word, and the word is the client
 * app's own scale — the one the client chose from — so what the shop reads is
 * what the client meant.
 */

/** One decimal, or a dash before anyone has said anything. */
export function formatStars(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return (Math.round(value * 10) / 10).toFixed(1);
}

/** The client app's words for each star, applied to an average by rounding. */
export function starWord(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return "Not rated yet";
  switch (Math.round(value)) {
    case 1:
      return "Poor";
    case 2:
      return "Below what they expected";
    case 3:
      return "About what they expected";
    case 4:
      return "Better than they expected";
    default:
      return "Excellent";
  }
}

/** The one sentence that says where the shop stands, for the account card and a screen reader. */
export function standingLine(
  summary: Pick<ReviewStats, "count" | "overall">,
  ranking: Pick<MyReviews["ranking"], "position" | "of">,
): string {
  if (summary.count === 0) return "No reviews yet";
  const stars = `${formatStars(summary.overall)} out of 5 from ${summary.count === 1 ? "1 review" : `${summary.count} reviews`}`;
  if (ranking.position == null) return stars;
  return `${stars}. Ranked #${ranking.position} of ${ranking.of === 1 ? "1 shop" : `${ranking.of} shops`}`;
}

/** Why the stars are not yet what matching reads. */
export function whyMatchingWaits(reviewsUntilMatching: number): string {
  if (reviewsUntilMatching <= 0) return "GRIDGO now matches jobs to you on your quality stars.";
  return `GRIDGO matches on your quality stars once you have 5 reviews. ${
    reviewsUntilMatching === 1 ? "One more to go." : `${reviewsUntilMatching} more to go.`
  } Until then it goes by how complete your board is.`;
}
