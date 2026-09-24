import { useAuth, useClerk, useUser } from "@clerk/expo";
import { useEffect, useRef, type ReactNode } from "react";

import * as api from "@/lib/api";
import { isUnmappedIdentity, supplierProjectionErrorMessage } from "@/lib/apiErrors";
import { awaitClerkSessionToken, clerkAccessFor, clerkSessionToken } from "@/lib/clerk";
import {
  ACCESS_WITHDRAWN_MESSAGE,
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
  const sessionEnded = useSession((state) =>
    state.identity.kind === "signed_out" && state.identity.reason === "session_ended",
  );
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  useEffect(() => {
    setClerkSignOutHandler(() => signOut());
    return () => setClerkSignOutHandler(null);
  }, [signOut]);

  // Clerk recreates `getToken` often. Keep one provider so an in-flight listing
  // save is not asked for a token from a function that is about to be replaced.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn || sessionEnded) {
      api.setTokenProvider(null);
      return;
    }
    api.setTokenProvider((options) => clerkSessionToken((tokenOptions) => getTokenRef.current(tokenOptions), options));
  }, [isLoaded, isSignedIn, sessionEnded]);

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

    // Clerk may still report the rejected session until signOut settles.
    // A user-resource refresh must not turn the sign-in message into Access.
    if (sessionEnded) return;

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
    if (alreadyAdopted) {
      return () => {
        cancelled = true;
      };
    }
    session.setClerkIdentity({ kind: "loading" });
    void (async () => {
      try {
        const joining = useSession.getState().sessionWait === "in";
        const token = await awaitClerkSessionToken(
          (options) => getTokenRef.current(options),
          joining ? 10 : 5,
          joining ? 400 : 120,
        );
        if (!token) {
          if (cancelled) return;
          const current = useSession.getState();
          if (current.identity.kind === "supplier" && current.user) return;
          // A finishing Clerk step has no JWT yet. That is not "new shop".
          if (access.kind === "supplier") {
            current.endClerkSession();
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
        if (current.identity.kind === "signed_out" && current.identity.reason === "session_ended") return;
        if (current.identity.kind === "supplier" && current.user) return;
        if (isUnmappedIdentity(error)) {
          current.setClerkIdentity({ kind: "unassigned", email });
          return;
        }
        if (error instanceof api.ApiError && error.status === 401) {
          current.endClerkSession();
          return;
        }
        if (error instanceof api.ApiError && error.status === 403) {
          current.setClerkIdentity({
            kind: "error",
            reason: "access_withdrawn",
            email,
            message: ACCESS_WITHDRAWN_MESSAGE,
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
  }, [isLoaded, isSignedIn, user, sessionEnded]);

  return children;
}
