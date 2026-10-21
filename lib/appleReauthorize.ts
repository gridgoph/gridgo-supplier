/** The end of asking Apple for a fresh authorization code. */
export type AppleReauthorization =
  | { status: "ok"; authorizationCode: string }
  | { status: "cancelled" }
  | { status: "failed" };

/**
 * Sign in with Apple exists on iPhone only. `appleReauthorize.ios.ts` asks
 * Apple; keeping it in its own file keeps `expo-apple-authentication` out of
 * the Android and web bundles, where the step never runs.
 */
export async function reauthorizeWithApple(): Promise<AppleReauthorization> {
  return { status: "failed" };
}
