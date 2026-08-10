import { useCallback, useState } from "react";

/**
 * The spinner belongs to the gesture, not to the fetch.
 *
 * Every list in this app reloads on focus, so binding `RefreshControl`'s
 * `refreshing` to the screen's own `loading` flag put the platform refresh
 * indicator on screen every time a tab was opened. On iOS that indicator insets
 * the scroll view to make room for itself and takes the inset back when it
 * finishes, so the whole page slid down and settled again on every tab switch —
 * a reload the shop never asked for, animated as though it had pulled.
 *
 * This state is set by the pull and by nothing else. A focus reload still
 * refreshes the data silently underneath, which is what a shop wants when it
 * comes back from a job.
 */
export function usePullToRefresh(reload: () => Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve(reload())
      .finally(() => setRefreshing(false))
      // Every screen states its own failure in its own words. This only makes
      // sure a rejected reload cannot escape as an unhandled rejection, or
      // leave the indicator spinning over a screen that has given up.
      .catch(() => {});
  }, [reload]);

  return { refreshing, onRefresh };
}
