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

  const reload = useCallback(async () => {
    if (!id) {
      setLoading(false);
      setError("This job link is incomplete. Open the job from Jobs or Schedule.");
      return;
    }
    setLoading(true);
    try {
      setJob(await api.getOrder(id));
      setError(null);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("open this job")));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { job, loading, error, reload };
}
