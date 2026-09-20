import { useEffect } from "react";

import { getSupportChatMe } from "@/lib/api";
import { openSupportChatStream } from "@/lib/supportChatStream";
import { useSession } from "@/store/session";
import { useSupportChatStore } from "@/store/supportChat";

export function useSupportChatUnread(enabled = true): void {
  const owner = useSession((s) => s.user?.id ?? null);
  const setUnreadCount = useSupportChatStore((s) => s.setUnreadCount);

  useEffect(() => {
    if (!enabled || !owner) {
      setUnreadCount(0);
      return;
    }
    let cancelled = false;
    void getSupportChatMe()
      .then((me) => {
        if (!cancelled) setUnreadCount(me.thread?.unreadCount ?? 0);
      })
      .catch(() => {});
    const stream = openSupportChatStream({
      onEvent: (event) => {
        if (!cancelled) setUnreadCount(event.thread.unreadCount ?? 0);
      },
    });
    return () => {
      cancelled = true;
      stream.close();
    };
  }, [enabled, owner, setUnreadCount]);
}
