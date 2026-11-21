import { create } from "zustand";
import { persist } from "zustand/middleware";

import { createPersistStorage } from "@/lib/persistStorage";

/** Enough to cover a busy week of jobs; the oldest drop off first. */
const KEEP = 200;

type FileOpens = {
  /** Client files this phone opened at full size, newest last. */
  fileIds: string[];
  record: (fileId: string) => void;
  forget: (fileIds: string[]) => void;
};

/**
 * Which client files this phone has opened — what "Print from this phone"
 * downloads — so the hand-over can remind the shop to delete them, and only
 * then (gridgo-supplier#269). A download on the shop's PC is not seen here;
 * GRIDGO does not record downloads per job yet.
 */
export const useFileOpens = create<FileOpens>()(
  persist(
    (set) => ({
      fileIds: [],
      record: (fileId) =>
        set((state) => ({ fileIds: [...state.fileIds.filter((id) => id !== fileId), fileId].slice(-KEEP) })),
      forget: (fileIds) => set((state) => ({ fileIds: state.fileIds.filter((id) => !fileIds.includes(id)) })),
    }),
    { name: "gridgo.supplier.fileOpens", storage: createPersistStorage<FileOpens>() },
  ),
);
