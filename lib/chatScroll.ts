/**
 * Whether a chat transcript should follow its newest message.
 *
 * When the keyboard opens, the transcript's viewport shrinks from the bottom
 * while its scroll offset stays put — so a reader who was looking at the
 * latest message is left looking at older ones, with the newest pushed out of
 * sight under the composer (gridgoph/gridgo-client#128). A reader who had scrolled up
 * to read history must not be yanked back down, though. So the transcript
 * remembers whether the reader was at the end, and only then re-pins it when
 * the viewport or the content changes size.
 */

/** Slack under which a reader counts as "at the end": about one line of chat. */
export const CHAT_END_SLACK = 48;

export type ChatScrollMetrics = {
  /** `contentOffset.y` — how far the transcript has been scrolled. */
  offsetY: number;
  /** Height of the visible transcript (`layoutMeasurement.height`). */
  viewportHeight: number;
  /** Height of every message laid end to end (`contentSize.height`). */
  contentHeight: number;
};

/** True when the newest message is on screen, or within `slack` of it. */
export function isAtChatEnd(
  { offsetY, viewportHeight, contentHeight }: ChatScrollMetrics,
  slack: number = CHAT_END_SLACK,
): boolean {
  // A transcript shorter than its viewport has nowhere to scroll: it is at the end.
  if (contentHeight <= viewportHeight) return true;
  return contentHeight - (offsetY + viewportHeight) <= slack;
}

/**
 * Whether a change in the viewport's height should re-pin the transcript.
 * Only a shrink matters — the keyboard opening, or the composer growing a
 * line. A grow cannot hide the newest message, and ignoring it keeps the
 * list still while the keyboard closes.
 */
export function shouldRepinOnResize(
  previousHeight: number | null,
  nextHeight: number,
  followingEnd: boolean,
): boolean {
  if (!followingEnd || previousHeight === null) return false;
  return nextHeight < previousHeight;
}
