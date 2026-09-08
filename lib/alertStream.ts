import * as api from "@/lib/api";
import { parseSseChunk, reconnectDelayMs, type SseEvent } from "@/lib/eventStream";
import { readInvalidation, type Invalidation } from "@/lib/live";

export type AlertStreamHandlers = {
  onNotification: (notification: api.Notification) => void;
  onInvalidate?: (event: Invalidation) => void;
  onStatus?: (live: boolean) => void;
  getResumeFrom?: () => string | null;
  onResumeUnavailable?: () => void | Promise<void>;
};
export type AlertStreamHandle = { close: () => void; wake: () => void };
export function readNotificationEvent(event: SseEvent): api.Notification | null {
  if (event.event !== "notification" || !event.data) return null;
  try {
    const parsed: unknown = JSON.parse(event.data);
    if (!parsed || typeof parsed !== "object") return null;
    const value = ((parsed as {notification?: unknown}).notification ?? parsed) as Partial<api.Notification>;
    return value && typeof value.id === "string" && typeof value.title === "string" ? value as api.Notification : null;
  } catch { return null; }
}

/** One authenticated XHR stream, bounded heartbeat timeout and fresh bearer on retry. */
export function openAlertStream(handlers: AlertStreamHandlers): AlertStreamHandle {
  let closed = false;
  let attempt = 0;
  let sequence = 0;
  let cursor: string | null = handlers.getResumeFrom?.() ?? null;
  let request: XMLHttpRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let watchdog: ReturnType<typeof setTimeout> | null = null;
  function abort() {
    if (timer) clearTimeout(timer);
    if (watchdog) clearTimeout(watchdog);
    timer = watchdog = null;
    const previous = request;
    request = null;
    if (previous) { previous.onreadystatechange = null; previous.onerror = null; previous.ontimeout = null; previous.abort(); }
  }
  function retry() {
    if (closed) return;
    ++sequence;
    abort();
    handlers.onStatus?.(false);
    timer = setTimeout(() => void connect(), reconnectDelayMs(++attempt, null));
  }
  async function connect() {
    if (closed) return;
    const ticket = ++sequence;
    abort();
    // Token issuance can also stall; waking/closing invalidates its eventual answer.
    watchdog = setTimeout(retry, 45_000);
    let token: string | null;
    try { token = await api.getAuthToken(); } catch { if (ticket === sequence) retry(); return; }
    if (closed || ticket !== sequence) return;
    if (!token) { retry(); return; }
    let consumed = 0;
    let buffer = "";
    let announced = false;
    const xhr = new XMLHttpRequest();
    request = xhr;
    xhr.open("GET", `${api.getApiBase()}/notifications/stream?role=supplier`);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("X-GRIDGO-Role", "supplier");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    if (cursor) xhr.setRequestHeader("Last-Event-ID", cursor);
    const fail = () => { if (!closed && request === xhr && ticket === sequence) retry(); };
    xhr.onerror = fail;
    xhr.ontimeout = fail;
    xhr.onreadystatechange = () => {
      if (closed || request !== xhr || ticket !== sequence) return;
      if (xhr.readyState !== 3 && xhr.readyState !== 4) return;
      if (xhr.status !== 200) {
        if (xhr.readyState !== 4) return;
        if (xhr.status === 409) {
          cursor = null;
          handlers.onStatus?.(false);
          void Promise.resolve(handlers.onResumeUnavailable?.()).catch(() => {}).finally(() => {
            if (!closed && ticket === sequence) retry();
          });
        } else retry(); // Includes 401: next connect obtains a fresh Clerk JWT.
        return;
      }
      if (!announced) { announced = true; attempt = 0; handlers.onStatus?.(true); }
      if (watchdog) clearTimeout(watchdog);
      watchdog = setTimeout(retry, 45_000);
      const text = xhr.responseText ?? "";
      if (text.length > consumed) {
        buffer += text.slice(consumed); consumed = text.length;
        const parsed = parseSseChunk(buffer); buffer = parsed.rest;
        for (const event of parsed.events) {
          if (closed || request !== xhr) break;
          if (event.id) cursor = event.id;
          const notification = readNotificationEvent(event);
          if (notification) handlers.onNotification(notification);
          else if (event.event === "invalidate") {
            const invalidation = readInvalidation(event.data);
            if (invalidation) handlers.onInvalidate?.(invalidation);
          }
        }
      }
      // Bound XHR's retained responseText, preserving notification cursor.
      if (xhr.readyState === 4 || consumed > 512_000) retry();
    };
    try { xhr.send(); } catch { retry(); }
  }
  void connect();
  return {
    close: () => { closed = true; ++sequence; abort(); },
    wake: () => { if (!closed) { attempt = 0; void connect(); } },
  };
}
