import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useCallback, useEffect, useState } from "react";

import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";

type JobState = {
  job: api.Order | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * One job, loaded by id.
 *
 * Every flow screen opens on the current server state rather than a copy passed
 * through navigation params — a job that moved while the shop was on another
 * screen must not be actioned from a stale card.
 */
export function useJob(id: string | undefined): JobState {
  const [job, setJob] = useState<api.Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [requestedId, setRequestedId] = useState(id);

  // A changed link starts loading before paint, without an effect-only render.
  if (requestedId !== id) {
    setRequestedId(id);
    setLoading(true);
  }

  const nextRead = useReadVersion();
  const load = useCallback(async () => {
    const current = nextRead();
    if (!id) return;
    await api.getOrder(id)
      .then((job) => {
        if (!current()) return;
        setJob(job);
        setError(null);
      })
      .catch((e: unknown) => {
        if (!current()) return;
        if (e instanceof api.ApiError && (e.status === 403 || e.status === 404)) setJob(null);
        setError(humanizeApiError(e, offlineMessage("open this job")));
      })
      .finally(() => {
        if (current()) setLoading(false);
      });
  }, [id, nextRead]);

  const reload = useCallback(async () => {
    setLoading(true);
    await load();
  }, [load]);

  useLiveRefresh(["orders", "jobs", "dispatch", "escalations", "claims", "payouts"], reload);

  useEffect(() => {
    void load();
  }, [load]);

  return {
    job,
    loading: Boolean(id) && loading,
    error: id ? error : "This job link is incomplete. Open the job from Jobs or Schedule.",
    reload,
  };
}
