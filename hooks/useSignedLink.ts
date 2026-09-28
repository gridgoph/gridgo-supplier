import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AppState } from "react-native";

import { heldReadIsStale, linkIsStale } from "@/lib/photoLinks";
import { heldLink, signedLink, type SignedLink } from "@/lib/signedLinks";

type LinkState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "ready"; link: SignedLink }
  | { kind: "failed" };

export type SignedPicture = {
  /** The link to draw, or null while there is none. */
  uri: string | null;
  /** Waiting on a link, the first one or a fresh one: draw the shimmer, not a failure. */
  loading: boolean;
  /** GRIDGO would not sign one, or a picture failed on a link that was still good. */
  failed: boolean;
  /** Give to the picture's `onError`. */
  onError: () => void;
  /** Give to the picture's `onLoad`. */
  onLoad: () => void;
};

function initial(fileId: string | null | undefined, enabled: boolean): LinkState {
  if (!enabled || !fileId) return { kind: "idle" };
  const held = heldLink(fileId);
  return held ? { kind: "ready", link: held } : { kind: "loading" };
}

/**
 * A picture GRIDGO holds, drawn through a link that is never older than it may be.
 *
 * Three rules, the same ones gridgo-client's sample tiles follow:
 *
 * - **An expired link is not a broken picture.** When the picture fails on a
 *   link that is expired or about to be, it asks for one fresh link and
 *   shimmers while it waits — once. If the fresh link fails too, the failure is
 *   real and is said.
 * - **A good link that fails is a failure.** No retry, so a file storage will
 *   not serve reads "will not load" rather than shimmering forever.
 * - **Coming back to the app is not a focus change.** On `AppState` → `active`,
 *   a link read four or more minutes ago, or one near expiry, is read again.
 *   The picture on screen stays until the fresh link replaces it.
 *
 * `enabled` false holds no link at all — a caller that is drawing something
 * else (a photo on this phone, a board link) turns it on only when it needs it.
 */
export function useSignedLink(
  fileId: string | null | undefined,
  enabled: boolean = true,
): SignedPicture {
  // State is remembered against the file it is for, so a different file (or
  // turning the hook on) starts from what memory holds, set during render.
  const key = enabled && fileId ? fileId : null;
  const [held, setHeld] = useState<{ key: string | null; state: LinkState }>(() => ({
    key,
    state: initial(fileId, enabled),
  }));
  let state = held.state;
  if (held.key !== key) {
    state = initial(fileId, enabled);
    setHeld({ key, state });
  }
  const setState = useCallback((next: LinkState) => setHeld({ key, state: next }), [key]);
  // A fresh link was already asked for since this picture last painted.
  const renewed = useRef(false);
  const ticket = useRef(0);
  const current = useRef(state);
  useLayoutEffect(() => {
    current.current = state;
  }, [state]);

  const read = useCallback(
    (force: boolean) => {
      if (!fileId) return;
      const mine = (ticket.current += 1);
      void signedLink(fileId, { force }).then((link) => {
        if (mine !== ticket.current) return;
        setState(link ? { kind: "ready", link } : { kind: "failed" });
      });
    },
    [fileId, setState],
  );

  useEffect(() => {
    renewed.current = false;
    if (current.current.kind === "loading") read(false);
    return () => {
      ticket.current += 1;
    };
  }, [key, read]);

  useEffect(() => {
    if (!enabled || !fileId) return;
    const subscription = AppState.addEventListener("change", (next) => {
      if (next !== "active") return;
      const held = current.current;
      if (held.kind !== "ready") return;
      if (!heldReadIsStale({ readAt: held.link.readAt, earliestExpiry: held.link.expiresAt })) return;
      renewed.current = false;
      read(true);
    });
    return () => subscription.remove();
  }, [enabled, fileId, read]);

  const onError = useCallback(() => {
    const held = current.current;
    if (held.kind !== "ready") return;
    if (!renewed.current && linkIsStale(held.link.expiresAt)) {
      renewed.current = true;
      setState({ kind: "loading" });
      read(true);
      return;
    }
    setState({ kind: "failed" });
  }, [read, setState]);

  const onLoad = useCallback(() => {
    renewed.current = false;
  }, []);

  return {
    uri: state.kind === "ready" ? state.link.url : null,
    loading: state.kind === "loading",
    failed: state.kind === "failed",
    onError,
    onLoad,
  };
}
