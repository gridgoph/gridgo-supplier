import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";
import type { ShopPin } from "@/lib/shopLocation";

/**
 * A half-finished shop account survives the app closing.
 *
 * Onboarding is five screens, and a shop owner filling them in is standing in a
 * working print shop: the phone rings, a customer walks in, the app goes to the
 * background. Losing four screens of typing at that point is how a sign-up
 * never gets finished, so every step writes here as it goes and each screen
 * reads back what it left.
 *
 * The password is the one field that is **not** persisted. Everything else is
 * ordinary business detail a shop puts on its own signage; a password on disk
 * is a liability the moment a phone is shared, and it costs one field to retype
 * in the rare case a draft is resumed after a relaunch.
 */

/** A document the shop has picked but GRIDGO has not stored yet. */
export type PickedDocument = {
  /** Device URI. Streamed at upload time, never read into memory. */
  uri: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

/** What Operations asks a shop for. Codes are this app's, not the platform's. */
export type DocumentKind = "business_permit" | "valid_id" | "sample_work";

export type SignupDraft = {
  shopName: string;
  contactName: string;
  email: string;
  phone: string;
  /** Never persisted — see the note above. */
  password: string;
  pin: ShopPin | null;
  /** Category codes, best first. Position is the rank. */
  categoryCodes: string[];
  documents: Partial<Record<DocumentKind, PickedDocument>>;
};

export const EMPTY_SIGNUP_DRAFT: SignupDraft = {
  shopName: "",
  contactName: "",
  email: "",
  phone: "",
  password: "",
  pin: null,
  categoryCodes: [],
  documents: {},
};

type SignupDraftState = {
  draft: SignupDraft;
  hydrated: boolean;
  patch: (next: Partial<SignupDraft>) => void;
  setDocument: (kind: DocumentKind, document: PickedDocument | null) => void;
  clear: () => void;
  markHydrated: () => void;
};

export const useSignupDraft = create<SignupDraftState>()(
  persist(
    (set) => ({
      draft: EMPTY_SIGNUP_DRAFT,
      hydrated: false,
      patch: (next) => set((s) => ({ draft: { ...s.draft, ...next } })),
      setDocument: (kind, document) =>
        set((s) => {
          const documents = { ...s.draft.documents };
          if (document) documents[kind] = document;
          else delete documents[kind];
          return { draft: { ...s.draft, documents } };
        }),
      clear: () => set({ draft: EMPTY_SIGNUP_DRAFT }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "gridgo.supplier.signupDraft",
      storage: createPersistStorage<SignupDraftState>(),
      partialize: (state) =>
        ({
          draft: { ...state.draft, password: "" },
        }) as SignupDraftState,
      // Runs whether or not anything was stored, so a first launch also reaches
      // the hydrated state instead of waiting forever.
      onRehydrateStorage: () => () => {
        useSignupDraft.getState().markHydrated();
      },
    },
  ),
);
