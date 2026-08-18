import * as api from "@/lib/api";
import { awaitClerkSessionToken, type ClerkGetToken } from "@/lib/clerk";
import { useSession } from "@/store/session";

export type AfterClerkAuth =
  | { kind: "home" }
  | { kind: "apply" }
  | { kind: "access" }
  | { kind: "blocked"; message: string };

/**
 * Join a live Clerk session to GRIDGO's supplier projection.
 *
 * Enrollment writes membership, not Clerk `publicMetadata.gridgoRole`, so the
 * only honest adopt is `/auth/me` with a fresh JWT. A missing membership is
 * apply, never the closed-shop screen — that one is for the wrong GRIDGO app.
 */
export async function enterAfterClerkSession(
  getToken: ClerkGetToken,
): Promise<AfterClerkAuth> {
  api.setTokenProvider(async () => (await getToken()) ?? null);
  const token = await awaitClerkSessionToken(getToken);
  if (!token) {
    return {
      kind: "blocked",
      message: "GRIDGO could not confirm your sign-in. Wait a moment and try again.",
    };
  }

  try {
    const user = await api.me({ ignoreUnauthorized: true });
    if (useSession.getState().adoptClerkUser(user)) return { kind: "home" };
    return { kind: "access" };
  } catch {
    const current = useSession.getState().identity;
    const email = "email" in current ? current.email : undefined;
    useSession.getState().setClerkIdentity({ kind: "unassigned", email });
    return { kind: "apply" };
  }
}

export function hrefAfterClerkAuth(
  result: Exclude<AfterClerkAuth, { kind: "blocked" }>,
): "/(tabs)/home" | "/(auth)/signup" | "/access" {
  if (result.kind === "home") return "/(tabs)/home";
  if (result.kind === "apply") return "/(auth)/signup";
  return "/access";
}
