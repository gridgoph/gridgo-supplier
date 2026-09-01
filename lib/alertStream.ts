import * as api from "@/lib/api";
import { parseSseChunk, reconnectDelayMs, type SseEvent } from "@/lib/eventStream";

/**
 * The live alert stream.
 *
 * Today this app only learns about an alert when a screen asks for one, so a
 * shop standing on the Jobs tab never finds out a job has been offered to it.
 * The platform is adding a per-user event stream; this is the client.
 *
 * ## The shape this is built against
 *
 * `GET /notifications/stream`, bearer-authenticated, `text/event-stream`:
 *
 * ```text
 * : heartbeat
 *
 * id: ntf_8c9f61e4b2aa
 * event: notification
 * data: {"notification":{ …the same object GET /notifications returns… }}
 * ```
 *
 * Resume is the standard `Last-Event-ID` request header, carrying the last id
 * this device saw. Heartbeats are SSE comments, so they cost the parser
 * nothing and keep the socket from being reaped by a mobile network.
 *
 * The route has not landed yet, so **everything here is written against that
 * documented shape**. When it ships, only this file should need checking.
 *
 * ## Failure is silent on purpose
 *
 * A shop cannot act on "the event stream is unavailable", and the app is not
 * broken without it — every screen still loads its own data on focus. So a
 * stream that will not open retries quietly in the background and shows
 * nothing. The one thing it must never do is claim the app is offline.
 */

export type AlertStreamHandlers = {
  /** A notification arrived. Always the full record, never a partial. */
  onNotification: (notification: api.Notification) => void;
  /** Fired on connect and disconnect so a caller can note liveness. */
  onStatus?: (live: boolean) => void;
  /**
   * Last event this phone has already rendered. Sent as `Last-Event-ID` so the
   * server does not replay the inbox. Read fresh on every connect.
   */
  getResumeFrom?: () => string | null;
  /** The stored cursor is gone. Clear it and fetch a fresh list snapshot. */
  onResumeUnavailable?: () => void | Promise<void>;
};

export type AlertStreamHandle = {
  /** Stop for good: no further reconnects. */
  close: () => void;
  /** Reconnect now — used when the app comes back from the background. */
  wake: () => void;
};

/** Read a `notification` frame. Anything malformed is ignored, never thrown. */
export function readNotificationEvent(event: SseEvent): api.Notification | null {
  if (event.event !== "notification" || !event.data) return null;
  try {
    const parsed: unknown = JSON.parse(event.data);
    if (typeof parsed !== "object" || !parsed) return null;
    const body = parsed as { notification?: unknown };
    // Accept either the wrapped shape the rest of this API uses or a bare
    // record, so a contract that lands slightly different still works.
    const candidate = (body.notification ?? parsed) as Partial<api.Notification>;
    if (typeof candidate.id !== "string" || typeof candidate.title !== "string") return null;
    return candidate as api.Notification;
  } catch {
    return null;
  }
}

const STREAM_PATH = "/notifications/stream";

/**
 * Open the stream and keep it open.
 *
 * `XMLHttpRequest` rather than `fetch`: React Native's fetch resolves only when
 * a response is complete, which never happens on a stream. XHR hands back
 * `responseText` as it grows, and the parser takes it from there.
 */
export function openAlertStream(handlers: AlertStreamHandlers): AlertStreamHandle {
  let closed = false;
  let attempt = 0;
  let lastEventId: string | null = null;
  let request: XMLHttpRequest | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const abort = () => {
    if (timer) clearTimeout(timer);
    timer = null;
    const current = request;
    request = null;
    // Detach before aborting: an abort fires the state handler, and a handler
    // that schedules its own reconnect would then race the one below.
    if (current) {
      current.onreadystatechange = null;
      try {
        current.abort();
      } catch {
        // Already finished.
      }
    }
  };

  const scheduleRetry = (suggested: number | null) => {
    if (closed) return;
    attempt += 1;
    timer = setTimeout(() => void connect(), reconnectDelayMs(attempt, suggested));
  };

  async function connect() {
    if (closed) return;
    let token: string | null;
    try {
      token = await api.getAuthToken();
    } catch {
      scheduleRetry(null);
      return;
    }
    if (closed) return;
    if (!token) {
      // Signed out mid-flight. Nothing to listen to, and no reason to retry.
      handlers.onStatus?.(false);
      return;
    }

    abort();
    let consumed = 0;
    let buffer = "";
    let announced = false;

    const xhr = new XMLHttpRequest();
    request = xhr;
    xhr.open("GET", `${api.getApiBase()}${STREAM_PATH}`);
    xhr.setRequestHeader("Accept", "text/event-stream");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    const resumeFrom = handlers.getResumeFrom?.() ?? lastEventId;
    if (resumeFrom) {
      lastEventId = resumeFrom;
      xhr.setRequestHeader("Last-Event-ID", resumeFrom);
    }

    xhr.onreadystatechange = () => {
      if (closed || request !== xhr) return;

      // 3 = LOADING: the body is arriving and `responseText` grows.
      if (xhr.readyState === 3 || xhr.readyState === 4) {
        if (xhr.status !== 200) {
          if (xhr.readyState === 4) {
            handlers.onStatus?.(false);
            // 401: the session went, and the session store handles that.
            // 404/501: this GRIDGO has no stream, which is a fact about the
            // deployment and will not change while the app is open. Retrying
            // either would be a request every few seconds for nothing — the
            // app is already correct without the stream.
            if (xhr.status === 401 || xhr.status === 404 || xhr.status === 501) {
              closed = true;
              return;
            }
            // 409: Last-Event-ID is gone. Drop it or the next retry replays
            // nothing useful and keeps failing on the same cursor.
            if (xhr.status === 409) {
              lastEventId = null;
              void Promise.resolve(handlers.onResumeUnavailable?.()).finally(() => {
                if (!closed) scheduleRetry(null);
              });
              return;
            }
            scheduleRetry(null);
          }
          return;
        }

        if (!announced) {
          announced = true;
          attempt = 0;
          handlers.onStatus?.(true);
        }

        const text = xhr.responseText ?? "";
        if (text.length > consumed) {
          buffer += text.slice(consumed);
          consumed = text.length;
          const { events, rest } = parseSseChunk(buffer);
          buffer = rest;
          for (const event of events) {
            if (event.id) lastEventId = event.id;
            const notification = readNotificationEvent(event);
            if (notification) handlers.onNotification(notification);
          }
        }
      }

      if (xhr.readyState === 4) {
        handlers.onStatus?.(false);
        // A stream that ends is normal — servers close them. Reopen from the
        // last id so nothing that happened in between is missed.
        scheduleRetry(null);
      }
    };

    try {
      xhr.send();
    } catch {
      scheduleRetry(null);
    }
  }

  void connect();

  return {
    close: () => {
      closed = true;
      abort();
    },
    wake: () => {
      if (closed) return;
      attempt = 0;
      void connect();
    },
  };
}
