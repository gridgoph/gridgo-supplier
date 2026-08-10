import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";
import { sendDocument, VERIFICATION_DOCUMENTS } from "@/lib/verification";
import type { DocumentKind, PickedDocument } from "@/store/signupDraft";

/**
 * The papers a shop chose during onboarding, on their way to Operations.
 *
 * They cannot go up during sign-up — there is no account to attach them to yet
 * — and the moment the account exists, the app moves the shop off the sign-up
 * screens. So the sending outlives the screen that started it, and lives here.
 *
 * Persisted, because the failure this is built for is a phone on a shop's
 * wifi: the account opens, the first upload fails, the app is closed. The
 * accreditation screen picks the queue back up and offers to send it again
 * rather than losing a permit somebody photographed once.
 */

export type DocumentSendStage = "queued" | "sending" | "sent" | "not_open_yet" | "failed";

export type DocumentEntry = {
  picked: PickedDocument;
  stage: DocumentSendStage;
  /** 0–1 while bytes are moving. */
  progress: number;
  /** Names what went wrong and how to fix it. Never a code. */
  error: string | null;
};

type AccreditationDocsState = {
  entries: Partial<Record<DocumentKind, DocumentEntry>>;
  hydrated: boolean;
  /** Queue everything a shop picked during onboarding. */
  queue: (documents: Partial<Record<DocumentKind, PickedDocument>>) => void;
  /** Add or replace one document after the account already exists. */
  add: (kind: DocumentKind, picked: PickedDocument) => void;
  remove: (kind: DocumentKind) => void;
  /** Send everything not already sent, one at a time. Safe to call twice. */
  send: () => Promise<void>;
  clear: () => void;
  markHydrated: () => void;
};

function patchEntry(
  entries: Partial<Record<DocumentKind, DocumentEntry>>,
  kind: DocumentKind,
  next: Partial<DocumentEntry>,
): Partial<Record<DocumentKind, DocumentEntry>> {
  const current = entries[kind];
  if (!current) return entries;
  return { ...entries, [kind]: { ...current, ...next } };
}

let sending = false;

export const useAccreditationDocs = create<AccreditationDocsState>()(
  persist(
    (set, get) => ({
      entries: {},
      hydrated: false,
      queue: (documents) =>
        set((s) => {
          const entries = { ...s.entries };
          for (const definition of VERIFICATION_DOCUMENTS) {
            const picked = documents[definition.kind];
            if (picked) {
              entries[definition.kind] = { picked, stage: "queued", progress: 0, error: null };
            }
          }
          return { entries };
        }),
      add: (kind, picked) =>
        set((s) => ({
          entries: { ...s.entries, [kind]: { picked, stage: "queued", progress: 0, error: null } },
        })),
      remove: (kind) =>
        set((s) => {
          const entries = { ...s.entries };
          delete entries[kind];
          return { entries };
        }),
      send: async () => {
        // One pass at a time. A second caller (the screen refocusing while the
        // first pass runs) would otherwise upload the same permit twice.
        if (sending) return;
        sending = true;
        try {
          for (const definition of VERIFICATION_DOCUMENTS) {
            const kind = definition.kind;
            const entry = get().entries[kind];
            if (!entry || entry.stage === "sent" || entry.stage === "sending") continue;

            set((s) => ({
              entries: patchEntry(s.entries, kind, { stage: "sending", progress: 0, error: null }),
            }));

            const outcome = await sendDocument(kind, entry.picked, (progress) => {
              set((s) => ({ entries: patchEntry(s.entries, kind, { progress }) }));
            });

            set((s) => ({
              entries: patchEntry(s.entries, kind, {
                stage:
                  outcome.status === "saved"
                    ? "sent"
                    : outcome.status === "not_open_yet"
                      ? "not_open_yet"
                      : "failed",
                progress: outcome.status === "saved" ? 1 : 0,
                error: outcome.status === "failed" ? outcome.message : null,
              }),
            }));
          }
        } finally {
          sending = false;
        }
      },
      clear: () => set({ entries: {} }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "gridgo.supplier.accreditationDocs",
      storage: createPersistStorage<AccreditationDocsState>(),
      partialize: (state) =>
        ({
          // A send that was in flight when the app died is queued again, not
          // left claiming to be sending forever.
          entries: Object.fromEntries(
            Object.entries(state.entries).map(([kind, entry]) => [
              kind,
              entry && entry.stage === "sending"
                ? { ...entry, stage: "queued" as const, progress: 0 }
                : entry,
            ]),
          ),
        }) as AccreditationDocsState,
      onRehydrateStorage: () => () => {
        useAccreditationDocs.getState().markHydrated();
      },
    },
  ),
);

/** One line on where the whole queue stands, for the accreditation screen. */
export function describeDocumentQueue(
  entries: Partial<Record<DocumentKind, DocumentEntry>>,
): { title: string; body: string; done: boolean } | null {
  const list = VERIFICATION_DOCUMENTS.map((d) => entries[d.kind]).filter(
    (entry): entry is DocumentEntry => entry != null,
  );
  if (!list.length) return null;

  const sent = list.filter((entry) => entry.stage === "sent").length;
  if (sent === list.length) {
    return {
      title: "Operations has your papers",
      body: `All ${sent} ${sent === 1 ? "file is" : "files are"} with GRIDGO. Nothing further is needed from you while they check them.`,
      done: true,
    };
  }
  if (list.some((entry) => entry.stage === "sending")) {
    return {
      title: "Sending your papers",
      body: `${sent} of ${list.length} ${list.length === 1 ? "file" : "files"} are with GRIDGO. Keep this screen open until it finishes.`,
      done: false,
    };
  }
  if (list.every((entry) => entry.stage === "not_open_yet")) {
    return {
      title: "Operations will ask for your papers directly",
      body: "GRIDGO has not opened document upload to shops yet. Your files are still on this phone — Operations will ask you for them while they check your account.",
      done: false,
    };
  }
  return {
    title: "Some papers did not reach GRIDGO",
    body: `${sent} of ${list.length} are with them. Operations cannot accredit a shop without the rest — send them again.`,
    done: false,
  };
}
