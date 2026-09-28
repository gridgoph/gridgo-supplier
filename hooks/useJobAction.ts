import { useCallback, useState } from "react";

import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";

type RunOptions = {
  jobId: string;
  targetState: string;
  /** Reaches the client's order timeline verbatim. */
  note: string;
  extra?: Record<string, unknown>;
};

type JobActionState = {
  busy: boolean;
  error: string | null;
  /** The last refusal as GRIDGO sent it, for a caller that turns one into a step. Never shown. */
  failure: unknown;
  clearError: () => void;
  /** Resolves to the updated job, or null when the step did not go through. */
  run: (options: RunOptions) => Promise<api.Order | null>;
};

/**
 * Runs one state-changing step against the API.
 *
 * Nothing is shown as done before the server says so: the caller only navigates
 * on a resolved order, and a failure leaves the shop on the screen with a
 * message that names the fix.
 */
export function useJobAction(): JobActionState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<unknown>(null);

  const run = useCallback(async ({ jobId, targetState, note, extra }: RunOptions) => {
    setBusy(true);
    setError(null);
    setFailure(null);
    try {
      return await api.transitionOrder(jobId, targetState, { note, ...extra });
    } catch (e) {
      setFailure(e);
      setError(humanizeApiError(e, offlineMessage("save this step")));
      return null;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    busy,
    error,
    failure,
    clearError: () => {
      setError(null);
      setFailure(null);
    },
    run,
  };
}
