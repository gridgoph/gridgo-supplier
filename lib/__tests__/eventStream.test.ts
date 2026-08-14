import * as api from "@/lib/api";
import { parseSseChunk, reconnectDelayMs } from "@/lib/eventStream";
import { openAlertStream, readNotificationEvent } from "@/lib/alertStream";

const FRAME =
  'id: ntf_1\nevent: notification\ndata: {"notification":{"id":"ntf_1","title":"New job","body":"b"}}\n\n';

describe("framing", () => {
  it("reads a complete event", () => {
    const { events, rest } = parseSseChunk(FRAME);
    expect(rest).toBe("");
    expect(events).toEqual([
      {
        event: "notification",
        data: '{"notification":{"id":"ntf_1","title":"New job","body":"b"}}',
        id: "ntf_1",
        retryMs: null,
      },
    ]);
  });

  /**
   * The bug this exists to prevent: a chunk that lands mid-frame parsed as if
   * it were whole, producing truncated JSON that is then silently dropped.
   */
  it("holds a half-arrived frame until the rest of it lands", () => {
    const first = parseSseChunk(FRAME.slice(0, 40));
    expect(first.events).toEqual([]);

    const second = parseSseChunk(first.rest + FRAME.slice(40));
    expect(second.events).toHaveLength(1);
    expect(readNotificationEvent(second.events[0])?.id).toBe("ntf_1");
  });

  it("treats a heartbeat as nothing at all", () => {
    expect(parseSseChunk(": heartbeat\n\n: heartbeat\n\n").events).toEqual([]);
  });

  it("reads several events out of one chunk", () => {
    const { events } = parseSseChunk(FRAME + FRAME.replace(/ntf_1/g, "ntf_2"));
    expect(events.map((e) => e.id)).toEqual(["ntf_1", "ntf_2"]);
  });

  it("accepts the line endings the spec allows", () => {
    const { events } = parseSseChunk(FRAME.replace(/\n/g, "\r\n"));
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("ntf_1");
  });

  it("joins multi-line data the way the spec says", () => {
    const { events } = parseSseChunk("event: x\ndata: one\ndata: two\n\n");
    expect(events[0].data).toBe("one\ntwo");
  });

  it("takes a server's own reconnect hint", () => {
    const { events } = parseSseChunk("retry: 4500\ndata: x\n\n");
    expect(events[0].retryMs).toBe(4500);
  });
});

describe("reading a notification off the wire", () => {
  it("accepts the wrapped shape and a bare record alike", () => {
    const wrapped = parseSseChunk(FRAME).events[0];
    expect(readNotificationEvent(wrapped)?.title).toBe("New job");

    const bare = parseSseChunk(
      'event: notification\ndata: {"id":"ntf_9","title":"T","body":"b"}\n\n',
    ).events[0];
    expect(readNotificationEvent(bare)?.id).toBe("ntf_9");
  });

  it("ignores anything it cannot trust, rather than throwing on a stream", () => {
    for (const raw of [
      "event: notification\ndata: not json\n\n",
      "event: notification\ndata: {}\n\n",
      'event: notification\ndata: {"id":1,"title":"T"}\n\n',
      'event: other\ndata: {"id":"n","title":"T"}\n\n',
      "event: notification\n\n",
    ]) {
      const [event] = parseSseChunk(raw).events;
      expect(event ? readNotificationEvent(event) : null).toBeNull();
    }
  });
});

describe("reconnecting", () => {
  it("backs off, and stays out of the way", () => {
    expect(reconnectDelayMs(1, null)).toBe(2000);
    expect(reconnectDelayMs(3, null)).toBe(8000);
    expect(reconnectDelayMs(50, null)).toBe(30000);
  });

  it("prefers the server's hint, within sane bounds", () => {
    expect(reconnectDelayMs(1, 4500)).toBe(4500);
    expect(reconnectDelayMs(1, 0)).toBe(1000);
    expect(reconnectDelayMs(1, 10 * 60_000)).toBe(60_000);
  });
});

describe("stream authentication", () => {
  const OriginalXHR = global.XMLHttpRequest;

  afterEach(() => {
    global.XMLHttpRequest = OriginalXHR;
    api.setToken(null);
    api.setTokenProvider(null);
  });

  it("opens with a fresh Clerk token", async () => {
    const headers: Record<string, string> = {};
    const xhr = {
      readyState: 1,
      status: 0,
      responseText: "",
      onreadystatechange: null as (() => void) | null,
      open: jest.fn(),
      setRequestHeader: jest.fn((name: string, value: string) => {
        headers[name] = value;
      }),
      send: jest.fn(),
      abort: jest.fn(),
    };
    global.XMLHttpRequest = jest.fn(() => xhr) as never;
    api.setToken("legacy-token");
    api.setTokenProvider(async () => "fresh-clerk-token");

    const stream = openAlertStream({ onNotification: jest.fn() });
    await Promise.resolve();
    await Promise.resolve();

    expect(headers.Authorization).toBe("Bearer fresh-clerk-token");
    expect(xhr.send).toHaveBeenCalledTimes(1);
    stream.close();
  });
});
