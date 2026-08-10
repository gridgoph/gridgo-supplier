/**
 * Server-sent events, without a dependency.
 *
 * React Native has no `EventSource` and its `fetch` cannot stream a response
 * body, but `XMLHttpRequest` exposes `responseText` as it grows — which is all
 * an SSE client needs. The browser build uses the real `EventSource`, because
 * one exists there and it handles reconnection for us.
 *
 * The parser below is separate from the transport on purpose: framing is the
 * part worth testing, and it is the part that goes wrong quietly. An event is
 * complete only at a blank line, so a chunk that arrives mid-frame must be held
 * rather than parsed — the classic bug here is a truncated JSON payload
 * silently dropped.
 */

export type SseEvent = {
  /** `event:` field, or `message` when the server does not name one. */
  event: string;
  /** `data:` lines, joined with newlines. */
  data: string;
  /** `id:` field, kept for `Last-Event-ID` on reconnect. */
  id: string | null;
  /** Server-suggested reconnect delay from a `retry:` field. */
  retryMs: number | null;
};

export type SseParseResult = {
  events: SseEvent[];
  /** Whatever is left after the last complete frame. Feed it back in. */
  rest: string;
};

/**
 * Split a buffer into complete frames.
 *
 * A line starting `:` is a comment — which is exactly what a heartbeat is, so
 * a stream that only sends heartbeats produces no events and no garbage.
 */
export function parseSseChunk(buffer: string): SseParseResult {
  // Normalise the three line endings the spec allows before splitting.
  const normalised = buffer.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = normalised.split("\n\n");
  const rest = parts.pop() ?? "";
  const events: SseEvent[] = [];

  for (const frame of parts) {
    let event = "message";
    let id: string | null = null;
    let retryMs: number | null = null;
    const data: string[] = [];
    let sawField = false;

    for (const line of frame.split("\n")) {
      if (!line || line.startsWith(":")) continue;
      const colon = line.indexOf(":");
      const field = colon === -1 ? line : line.slice(0, colon);
      const value = colon === -1 ? "" : line.slice(colon + 1).replace(/^ /, "");

      if (field === "event") {
        event = value;
        sawField = true;
      } else if (field === "data") {
        data.push(value);
        sawField = true;
      } else if (field === "id") {
        id = value;
        sawField = true;
      } else if (field === "retry") {
        const parsed = Number(value);
        if (Number.isFinite(parsed) && parsed >= 0) retryMs = parsed;
        sawField = true;
      }
    }

    if (sawField) events.push({ event, data: data.join("\n"), id, retryMs });
  }

  return { events, rest };
}

/** Backoff between reconnects: quick at first, then out of the way. */
export function reconnectDelayMs(attempt: number, suggested: number | null): number {
  if (suggested != null) return Math.min(60_000, Math.max(1_000, suggested));
  return Math.min(30_000, 1_000 * 2 ** Math.min(attempt, 5));
}
