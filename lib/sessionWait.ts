/** Shortest sign-out wait so the yellow cell can leave before Welcome. */
export const SESSION_WAIT_OUT_MS = 1200;

export function sessionWaitHold(startedAt: number, minMs = SESSION_WAIT_OUT_MS): Promise<void> {
  const left = minMs - (Date.now() - startedAt);
  if (left <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, left));
}
