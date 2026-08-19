/**
 * First-frame pager height so the copy sits under the picture before onLayout.
 *
 * A few pixels off is invisible; height 0 is the jump from the header to
 * the footer.
 */

export const ONBOARDING_CHROME_HEADER = 80;
export const ONBOARDING_CHROME_FOOTER = 120;

export function estimatePagerHeight(
  windowHeight: number,
  insetTop: number,
  insetBottom: number,
): number {
  if (!Number.isFinite(windowHeight) || windowHeight <= 0) return 0;
  const top = Number.isFinite(insetTop) ? Math.max(0, insetTop) : 0;
  const bottom = Number.isFinite(insetBottom) ? Math.max(0, insetBottom) : 0;
  return Math.max(
    0,
    Math.round(
      windowHeight - top - bottom - ONBOARDING_CHROME_HEADER - ONBOARDING_CHROME_FOOTER,
    ),
  );
}
