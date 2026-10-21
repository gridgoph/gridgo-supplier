import { signInAsync } from "expo-apple-authentication";

import type { AppleReauthorization } from "./appleReauthorize";
import { isAppleCancel } from "@/lib/appleSignIn";

export type { AppleReauthorization } from "./appleReauthorize";

/**
 * Ask Apple, on its own sheet, for a fresh authorization code to revoke.
 *
 * Straight to `expo-apple-authentication`, never through Clerk: the code is
 * GRIDGO's to exchange and revoke, it is single use, and handing it to Clerk
 * would spend it and could switch the signed-in identity. No name or email is
 * asked for. The code is returned, never logged or stored.
 */
export async function reauthorizeWithApple(): Promise<AppleReauthorization> {
  try {
    const credential = await signInAsync({ requestedScopes: [] });
    return credential.authorizationCode
      ? { status: "ok", authorizationCode: credential.authorizationCode }
      : { status: "failed" };
  } catch (error) {
    return isAppleCancel(error) ? { status: "cancelled" } : { status: "failed" };
  }
}
