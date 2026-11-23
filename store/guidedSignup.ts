import { create } from "zustand";

import {
  loadGuidedSignup,
  loadShopSignup,
  saveSignupStep,
  type GuidedSignup,
  type PayoutStatus,
  type SignupTerms,
  type StepSave,
} from "@/lib/guidedSignup";
import { addSamplePhotos } from "@/lib/signupAfterEnroll";

/**
 * The guided sign-up as GRIDGO last answered it.
 *
 * Not persisted: GRIDGO keeps the draft, so reopening the app reads it again
 * and lands on the step GRIDGO says is next. Only what a step has not saved
 * yet lives on the phone (`store/signupDraft.ts`).
 *
 * `mode` is the one decision apply waits for: `guided` when this GRIDGO
 * offers the guided flow, `legacy` when it does not (the older four steps).
 */
type Mode = "unknown" | "guided" | "legacy" | "failed";

type GuidedSignupState = {
  mode: Mode;
  signup: GuidedSignup | null;
  terms: SignupTerms | null;
  payoutStatus: PayoutStatus | null;
  error: string | null;
  /** The shop's setup has been read once since sign-in (answered or not). */
  shopRead: boolean;
  /** Read the draft (before enrollment). */
  load: () => Promise<Mode>;
  /** @internal The read `load` shares. */
  readDraft: () => Promise<Mode>;
  /** Read the shop's setup (after enrollment). Leaves `terms` as last read. */
  loadShop: () => Promise<GuidedSignup | null>;
  /**
   * Save one step. A stale version reads the draft again and tries once more
   * with the same answer — steps replace, so the retry cannot double anything.
   */
  save: (
    step: "eligibility" | "shop" | "location" | "prints",
    value: Record<string, unknown>,
  ) => Promise<StepSave>;
  reset: () => void;
};

// Screens and the steps all read on focus; one read in flight serves them all.
let loading: Promise<Mode> | null = null;
// The sample photos are finished quietly by whichever screen reads first.
let addingPhotos = false;

export const useGuidedSignup = create<GuidedSignupState>()((set, get) => ({
  mode: "unknown",
  signup: null,
  terms: null,
  payoutStatus: null,
  error: null,
  shopRead: false,
  load: () => {
    loading ??= get()
      .readDraft()
      .finally(() => {
        loading = null;
      });
    return loading;
  },
  readDraft: async () => {
    const read = await loadGuidedSignup();
    if (read.status === "ok") {
      set({ mode: "guided", signup: read.signup, terms: read.terms, error: null });
      return "guided";
    }
    if (read.status === "not_open_yet") {
      set({ mode: "legacy", error: null });
      return "legacy";
    }
    set({ mode: get().mode === "guided" ? "guided" : "failed", error: read.message });
    return get().mode;
  },
  loadShop: async () => {
    const read = await loadShopSignup();
    if (read.status !== "ok") {
      set({ shopRead: true });
      return get().signup;
    }
    set({ signup: read.signup, payoutStatus: read.payoutStatus, shopRead: true });
    // GRIDGO's last step is a sample photo on every generated listing. It is
    // the app's to do, not the shop's, so it runs on every read until done.
    if (read.signup?.nextStep === "listing_photos" && !addingPhotos) {
      addingPhotos = true;
      void addSamplePhotos()
        .then(async (added) => {
          if (!added) return;
          const again = await loadShopSignup();
          if (again.status === "ok") set({ signup: again.signup, payoutStatus: again.payoutStatus });
        })
        .finally(() => {
          addingPhotos = false;
        });
    }
    // The consent wording and page rates live on the draft read, which the
    // signed-in shop can still make. Only fetched once.
    if (read.signup && !get().terms) {
      const terms = await loadGuidedSignup();
      if (terms.status === "ok") set({ terms: terms.terms, mode: "guided" });
    }
    return read.signup;
  },
  save: async (step, value) => {
    const attempt = async (): Promise<StepSave> =>
      saveSignupStep(get().signup?.version ?? 0, step, value);
    let result = await attempt();
    if (result.status === "stale") {
      await get().load();
      result = await attempt();
    }
    if (result.status === "ok") set({ signup: result.signup, terms: result.terms, error: null });
    return result;
  },
  reset: () =>
    set({ mode: "unknown", signup: null, terms: null, payoutStatus: null, error: null, shopRead: false }),
}));
