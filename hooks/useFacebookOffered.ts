import { useAuth, useClerk } from "@clerk/expo";

import { environmentOffersFacebook, type ClerkEnvironmentLike } from "@/lib/facebookSignIn";

/**
 * True once Clerk has loaded and its environment offers Facebook. Until then,
 * and on a Clerk without Facebook, the button is simply not drawn.
 */
export function useFacebookOffered(): boolean {
  // `isLoaded` re-renders this once Clerk's environment has arrived.
  const { isLoaded } = useAuth();
  const clerk = useClerk() as { __internal_environment?: ClerkEnvironmentLike };
  if (!isLoaded) return false;
  return environmentOffersFacebook(clerk.__internal_environment);
}
