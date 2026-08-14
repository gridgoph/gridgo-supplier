/**
 * Complete a Clerk Google browser-SSO attempt.
 *
 * A created session must be activated before this binary leaves sign-in so
 * the Clerk bridge can join it to GRIDGO's supplier projection. Clerk's Core 3
 * SSO result omits `setActive`, so the caller supplies the current Clerk
 * instance's implementation as a fallback.
 */

export type GoogleSsoFlowResult = {
  createdSessionId: string | null;
  setActive?: (args: { session: string }) => Promise<unknown>;
  authSessionResult?: { type?: string } | null;
};

export type GoogleSsoOutcome =
  | { status: "already_signed_in" }
  | { status: "activated"; sessionId: string }
  | { status: "cancelled" }
  | { status: "incomplete" };

export async function completeGoogleSso(input: {
  alreadySignedIn: boolean;
  startSSOFlow: () => Promise<GoogleSsoFlowResult>;
  setActive: (args: { session: string }) => Promise<unknown>;
}): Promise<GoogleSsoOutcome> {
  if (input.alreadySignedIn) return { status: "already_signed_in" };

  const result = await input.startSSOFlow();
  const dismiss = result.authSessionResult?.type;
  if (dismiss === "cancel" || dismiss === "dismiss") return { status: "cancelled" };

  if (result.createdSessionId) {
    const activate = result.setActive ?? input.setActive;
    await activate({ session: result.createdSessionId });
    return { status: "activated", sessionId: result.createdSessionId };
  }

  return { status: "incomplete" };
}
