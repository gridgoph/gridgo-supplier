import { useClerk } from "@clerk/expo";
import { useEffect, useState } from "react";

import { clerkOffersFacebook } from "@/lib/facebookSignIn";

/**
 * True once Clerk's environment says Facebook is switched on. Until then, and
 * whenever the read fails, the button is simply not drawn.
 */
export function useFacebookOffered(): boolean {
  const clerk = useClerk() as { publishableKey?: string | null };
  const key = clerk.publishableKey;
  const [offered, setOffered] = useState(false);

  useEffect(() => {
    let live = true;
    void clerkOffersFacebook(key).then((answer) => {
      if (live) setOffered(answer);
    });
    return () => {
      live = false;
    };
  }, [key]);

  return offered;
}
