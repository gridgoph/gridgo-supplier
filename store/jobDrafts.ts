import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/**
 * Half-finished work on a job survives the app closing.
 *
 * A shop fills the accept form, gets called to the press, and comes back — or
 * the phone dies mid-note. Losing a typed promise time or a half-written note
 * means doing the work twice, so all of it is persisted per job id. Older
 * persisted drafts may still carry retired checklist keys; they are ignored.
 */

export type AcceptDraft = {
  /** ISO instant the shop promises to finish by. */
  promisedAt: string | null;
  /** Final print total in pesos, as typed. Empty means "leave as quoted". */
  finalTotal: string;
};

export type JobDraft = {
  accept: AcceptDraft;
  /** Note the shop is writing for the client's timeline. */
  note: string;
};

export const EMPTY_JOB_DRAFT: JobDraft = {
  accept: { promisedAt: null, finalTotal: "" },
  note: "",
};

type JobDraftsState = {
  drafts: Record<string, JobDraft>;
  hydrated: boolean;
  setAccept: (jobId: string, patch: Partial<AcceptDraft>) => void;
  setNote: (jobId: string, note: string) => void;
  /** Called once a job leaves the step the draft belonged to. */
  clearDraft: (jobId: string) => void;
  /** Set when persisted drafts land, so a form never flashes empty first. */
  markHydrated: () => void;
};

function withDraft(
  drafts: Record<string, JobDraft>,
  jobId: string,
  update: (draft: JobDraft) => JobDraft,
): Record<string, JobDraft> {
  const current = drafts[jobId] ?? EMPTY_JOB_DRAFT;
  return { ...drafts, [jobId]: update(current) };
}

export const useJobDrafts = create<JobDraftsState>()(
  persist(
    (set) => ({
      drafts: {},
      hydrated: false,
      setAccept: (jobId, patch) =>
        set((s) => ({
          drafts: withDraft(s.drafts, jobId, (d) => ({
            ...d,
            accept: { ...d.accept, ...patch },
          })),
        })),
      setNote: (jobId, note) =>
        set((s) => ({ drafts: withDraft(s.drafts, jobId, (d) => ({ ...d, note })) })),
      clearDraft: (jobId) =>
        set((s) => {
          if (!s.drafts[jobId]) return s;
          const next = { ...s.drafts };
          delete next[jobId];
          return { drafts: next };
        }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "gridgo.supplier.jobDrafts",
      storage: createPersistStorage<JobDraftsState>(),
      partialize: (state) => ({ drafts: state.drafts }) as JobDraftsState,
      // Runs whether or not anything was stored, so a first launch also
      // reaches the hydrated state instead of waiting forever.
      onRehydrateStorage: () => () => {
        useJobDrafts.getState().markHydrated();
      },
    },
  ),
);

/** Read one job's draft, falling back to an empty one. */
export function useJobDraft(jobId: string | undefined): JobDraft {
  return useJobDrafts((s) => (jobId ? (s.drafts[jobId] ?? EMPTY_JOB_DRAFT) : EMPTY_JOB_DRAFT));
}
