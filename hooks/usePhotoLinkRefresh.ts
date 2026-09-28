import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { AppState } from "react-native";

import type { SamplePhoto } from "@/lib/listings";
import { earliestPhotoExpiry, heldReadIsStale } from "@/lib/photoLinks";

type Listings = readonly ({ photos: readonly SamplePhoto[] } | null | undefined)[];

/**
 * Keeps the board links a screen holds from outliving their signature.
 *
 * `listings` is what the screen is drawing now (null while nothing is held),
 * and its identity is the read: a new array is a new read. `reread` is the
 * screen's own quiet re-read of the same thing.
 *
 * Resuming the app is not a focus change, so a screen that re-reads on focus
 * still draws the links it held when the phone went to sleep. On `AppState` →
 * `active`, while the screen is focused, a held read four or more minutes old,
 * or one whose soonest photo link is stale, is read again — one at a time.
 * The live stream usually reconciles on resume as well; this is what keeps the
 * board's photos right when it does not reconnect.
 *
 * There is no per-tile "ask the screen" path, unlike gridgo-client: a tile
 * here holds its file id, so a board link that fails anyway falls back to that
 * file's own link in `SamplePhoto` (`hooks/useSignedLink.ts`).
 */
export function usePhotoLinkRefresh(listings: Listings | null, reread: () => unknown): void {
  const latest = useRef({ listings, reread });
  useLayoutEffect(() => {
    latest.current = { listings, reread };
  }, [listings, reread]);

  // When the listings on screen arrived, by the phone's clock.
  const readAt = useRef<number | null>(null);
  useEffect(() => {
    readAt.current = listings ? Date.now() : null;
  }, [listings]);

  const running = useRef(false);

  useFocusEffect(
    useCallback(() => {
      const subscription = AppState.addEventListener("change", (state) => {
        if (state !== "active" || running.current) return;
        const held = latest.current.listings;
        if (!held) return;
        const stale = heldReadIsStale({
          readAt: readAt.current,
          earliestExpiry: earliestPhotoExpiry(held),
        });
        if (!stale) return;
        running.current = true;
        void Promise.resolve()
          .then(() => latest.current.reread())
          .catch(() => {
            /* The screen owns its error; a tile says what it could not load. */
          })
          .finally(() => {
            running.current = false;
          });
      });
      return () => subscription.remove();
    }, []),
  );
}
