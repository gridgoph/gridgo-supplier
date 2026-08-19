import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useEffect, type ReactNode } from "react";

import * as api from "@/lib/api";
import { supplierProjectionErrorMessage } from "@/lib/apiErrors";
import { awaitClerkSessionToken, clerkAccessFor } from "@/lib/clerk";
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
      // Leave signed_out in place so welcome stays mounted. Flipping this to
      // loading used to unmount the door and leave the dark canvas empty.
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
    if (access.kind === "mismatch") {
      api.setTokenProvider(null);
      api.setToken(null);
      session.setClerkIdentity({ ...access, email });
      return () => {
        cancelled = true;
      };
    }

    const alreadyAdopted =
      session.identity.kind === "supplier" && session.user != null;
    if (!alreadyAdopted) session.setClerkIdentity({ kind: "loading" });
    api.setTokenProvider(getToken);
    void (async () => {
      try {
        const token = await awaitClerkSessionToken(getToken);
        if (!token) {
          if (cancelled) return;
          if (access.kind === "supplier") {
            useSession.getState().setClerkIdentity({
              kind: "error",
              email,
              message: supplierProjectionErrorMessage(new Error("missing token")),
            });
            return;
          }
          useSession.getState().setClerkIdentity({ kind: "unassigned", email });
          return;
        }
        const supplier = await api.me({
          ignoreUnauthorized: access.kind !== "supplier",
        });
        if (!cancelled) useSession.getState().adoptClerkUser(supplier);
      } catch (error) {
        if (cancelled) return;
        const current = useSession.getState();
        if (current.identity.kind === "supplier" && current.user) return;
        if (access.kind === "supplier") {
          current.setClerkIdentity({
            kind: "error",
            email,
            message: supplierProjectionErrorMessage(error),
          });
          return;
        }
        current.setClerkIdentity({ kind: "unassigned", email });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, user]);

  return children;
}
