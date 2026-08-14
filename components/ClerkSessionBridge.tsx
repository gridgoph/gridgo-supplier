import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useEffect, type ReactNode } from "react";

import * as api from "@/lib/api";
import { clerkAccessFor } from "@/lib/clerk";
import {
  setClerkSignOutHandler,
  useSession,
} from "@/store/session";

type Props = { children: ReactNode };

/**
 * Joins Clerk identity to GRIDGO's supplier projection.
 *
 * Clerk decides who the person is. The server-written role decides whether
 * this binary may ask for a supplier projection, and `gridgo-api` remains the
 * final authority for that projection and every protected operation.
 */
export function ClerkSessionBridge({ children }: Props) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const { signOut } = useClerk();

  useEffect(() => {
    setClerkSignOutHandler(() => signOut());
    return () => setClerkSignOutHandler(null);
  }, [signOut]);

  useEffect(() => {
    let cancelled = false;
    const session = useSession.getState();

    if (!isLoaded) {
      if (session.authSource !== "legacy") {
        session.setClerkIdentity({ kind: "loading" });
      }
      return () => {
        cancelled = true;
      };
    }

    if (!isSignedIn || !user) {
      session.clearClerkIdentity();
      return () => {
        cancelled = true;
      };
    }

    const email = user.primaryEmailAddress?.emailAddress ?? null;
    const access = clerkAccessFor(user.publicMetadata);
    if (access.kind !== "supplier") {
      api.setTokenProvider(null);
      api.setToken(null);
      session.setClerkIdentity({ ...access, email });
      return () => {
        cancelled = true;
      };
    }

    session.setClerkIdentity({ kind: "loading" });
    api.setTokenProvider(getToken);
    void (async () => {
      try {
        const supplier = await api.me();
        if (!cancelled) useSession.getState().adoptClerkUser(supplier);
      } catch {
        if (!cancelled) {
          useSession.getState().setClerkIdentity({
            kind: "error",
            email,
            message:
              "GRIDGO could not open this supplier account. Ask Operations to check the invitation.",
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, user]);

  return children;
}
