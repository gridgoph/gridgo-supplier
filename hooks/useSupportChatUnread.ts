import { useEffect } from "react";

import { getSupportChatMe } from "@/lib/api";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSession } from "@/store/session";
import { useSupportChatStore } from "@/store/supportChat";

function unreadFromMe(me: {
  unreadCount?: number;
  threads?: { unreadCount: number }[];
  thread?: { unreadCount: number } | null;
}): number {
  if (typeof me.unreadCount === "number") return me.unreadCount;
  if (me.threads?.length) return me.threads.reduce((sum, row) => sum + (row.unreadCount || 0), 0);
  return me.thread?.unreadCount ?? 0;
}

/** Keeps the header badge honest across every Operations conversation. */
export function useSupportChatUnread(enabled = true): void {
  const owner = useSession((s) => s.user?.id ?? null);
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);

  useEffect(() => {
    if (!enabled || !owner) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    const pull = () => {
      void getSupportChatMe()
        .then((me) => {
          if (!cancelled) setUnreadCount(unreadFromMe(me));
        })
        .catch(() => {});
    };
    pull();
    const stream = openSupportChatStream({
      onEvent: () => pull(),
    });
    return () => {
      cancelled = true;
      stream.close();
    };
  }, [enabled, owner, setUnreadCount]);
}
