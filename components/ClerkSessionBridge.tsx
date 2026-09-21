import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useEffect, type ReactNode } from "react";

import * as api from "@/lib/api";
import { isUnmappedIdentity, supplierProjectionErrorMessage } from "@/lib/apiErrors";
import { awaitClerkSessionToken, clerkAccessFor } from "@/lib/clerk";
import {
  setClerkSignOutHandler,
  useSession,
} from "@/store/session";

type Props = { children: ReactNode };

/**
 * Joins Clerk identity to GRIDGO's supplier projection.
 *
 * Clerk decides who the person is. GRIDGO validates this app’s membership
 * and remains the authority for the supplier projection and protected operations.
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

    if (!isSignedIn) {
      session.clearClerkIdentity();
      return () => {
        cancelled = true;
      };
    }

    // Clerk can report signed-in before `useUser()` has a person. Treating a
    // missing user as sign-out wiped a shop that Sign in had just adopted and
    // remounted the stack on welcome. Membership is `/auth/me`, not metadata,
    // so probe even while the Clerk user object is still arriving.
    const email = user?.primaryEmailAddress?.emailAddress ?? null;
    const access = clerkAccessFor(user?.publicMetadata);
    // Primary-role metadata cannot reject a supplier membership. Ask the API
    // with this app's role header before deciding whether the account belongs here.

    const alreadyAdopted =
      session.identity.kind === "supplier" && session.user != null;
    if (!alreadyAdopted) session.setClerkIdentity({ kind: "loading" });
    api.setTokenProvider(getToken);
    void (async () => {
      try {
        const joining = useSession.getState().sessionWait === "in";
        const token = await awaitClerkSessionToken(
          getToken,
          joining ? 10 : 5,
          joining ? 400 : 120,
        );
        if (!token) {
          if (cancelled) return;
          const current = useSession.getState();
          if (current.identity.kind === "supplier" && current.user) return;
          // A finishing Clerk step has no JWT yet. That is not "new shop".
          if (access.kind === "supplier") {
            useSession.getState().setClerkIdentity({
              kind: "error",
              email,
              message: supplierProjectionErrorMessage(new Error("missing token")),
            });
            return;
          }
          useSession.getState().setClerkIdentity({ kind: "loading" });
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
        if (isUnmappedIdentity(error)) {
          current.setClerkIdentity({ kind: "unassigned", email });
          return;
        }
        if (access.kind === "supplier") {
          current.setClerkIdentity({
            kind: "error",
            email,
            message: supplierProjectionErrorMessage(error),
          });
          return;
        }
        current.setClerkIdentity({
          kind: "error",
          email,
          message: supplierProjectionErrorMessage(error),
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [getToken, isLoaded, isSignedIn, user]);

  return children;
}
