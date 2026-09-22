import * as api from "@/lib/api";
import { parseSseChunk, reconnectDelayMs } from "@/lib/eventStream";

export type SupportChatEvent = {
  type: "message";
  thread: api.SupportChatThread;
  message: api.SupportChatMessage;
};

export function readSupportChatEvent(event: { event: string; data: string }): SupportChatEvent | null {
  if (event.event !== "support_chat" || !event.data) return null;
  try {
    const parsed = JSON.parse(event.data) as Partial<SupportChatEvent>;
    if (parsed?.type !== "message" || !parsed.thread?.id || !parsed.message?.id) return null;
    return parsed as SupportChatEvent;
  } catch {
    return null;
  }
}

export function openSupportChatStream(handlers: {
  onEvent: (event: SupportChatEvent) => void;
  onStatus?: (live: boolean) => void;
}): { close: () => void } {
  let closed = false;
  let attempt = 0;
  let sequence = 0;
  let cursor: string | null = null;
  let request: XMLHttpRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;

  function abort() {
    if (timer) clearTimeout(timer);
    if (watchdog) clearTimeout(watchdog);
    timer = watchdog = null;
    const previous = request;
    request = null;
    if (previous) {
      previous.onreadystatechange = null;
      previous.onerror = null;
      previous.abort();
    }
  }

  function retry() {
    if (closed) return;
    sequence += 1;
    abort();
    handlers.onStatus?.(false);
    timer = setTimeout(() => void connect(), reconnectDelayMs(++attempt, null));
  }

  async function connect() {
    if (closed) return;
    const ticket = ++sequence;
    abort();
    watchdog = setTimeout(retry, 45_000);
    const token = await api.getAuthToken().catch(() => null);
    if (closed || ticket !== sequence) return;
    if (!token) {
      retry();
      return;
    }
    let consumed = 0;
    let buffer = "";
    const xhr = new XMLHttpRequest();
    request = xhr;
    xhr.open("GET", `${api.getApiBase()}/support-chat/stream`);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("X-GRIDGO-Role", "supplier");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (cursor) xhr.setRequestHeader("Last-Event-ID", cursor);
    xhr.onerror = () => {
      if (!closed && request === xhr && ticket === sequence) retry();
    };
    xhr.onreadystatechange = () => {
      if (closed || request !== xhr || ticket !== sequence) return;
      if (xhr.readyState !== 3 && xhr.readyState !== 4) return;
      if (xhr.status !== 200) {
        if (xhr.readyState === 4) retry();
        return;
      }
      attempt = 0;
      handlers.onStatus?.(true);
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(retry, 45_000);
      const text = xhr.responseText ?? "";
      if (text.length > consumed) {
        buffer += text.slice(consumed);
        consumed = text.length;
        const parsed = parseSseChunk(buffer);
        buffer = parsed.rest;
        for (const event of parsed.events) {
          if (event.id) cursor = event.id;
          const chat = readSupportChatEvent(event);
          if (chat) handlers.onEvent(chat);
        }
      }
      if (xhr.readyState === 4 || consumed > 512_000) retry();
    };
    try {
      xhr.send();
    } catch {
      retry();
    }
  }

  void connect();
  return {
    close: () => {
      closed = true;
      sequence += 1;
      abort();
    },
  };
}
