import { ApiError } from "@/lib/apiErrors";
import type { CallRuntime } from "@/lib/callRuntime";
import { CallSession, RECONNECT_GIVE_UP_MS, type CallApi, type CallSnapshot } from "@/lib/callSession";
import { CALL_HEARTBEAT_MS, CALL_LEASE_MS, CALL_POLL_MS, type OrderCall } from "@/lib/orderCall";

/*
  The native module is a fake: a peer that records what it was told and lets
  the test fire its events. Everything the session decides — what it sends,
  when it rings, and that it always stops the microphone — is real.
*/

class FakeTrack {
  enabled = true;
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakePeer {
  static last: FakePeer | null = null;
  iceConnectionState = "new";
  listeners: Record<string, ((event: unknown) => void)[]> = {};
  tracks: FakeTrack[] = [];
  remote: { type: string; sdp: string }[] = [];
  candidates: unknown[] = [];
  local: { type: string; sdp: string } | null = null;
  closed = false;
  constructor(public config: unknown) {
    FakePeer.last = this;
  }
  addEventListener(type: string, listener: (event: unknown) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  emit(type: string, event: unknown = {}) {
    for (const listener of this.listeners[type] ?? []) listener(event);
  }
  setIce(state: string) {
    this.iceConnectionState = state;
    this.emit("iceconnectionstatechange");
  }
  addTrack(track: FakeTrack) {
    this.tracks.push(track);
  }
  async createOffer() {
    return { type: "offer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" };
  }
  async createAnswer() {
    return { type: "answer", sdp: "v=0\r\nm=audio 9 UDP/TLS/RTP/SAVPF 111\r\n" };
  }
  async setLocalDescription(description: { type: string; sdp: string }) {
    this.local = description;
  }
  async setRemoteDescription(description: { type: string; sdp: string }) {
    this.remote.push(description);
  }
  async addIceCandidate(candidate: unknown) {
    this.candidates.push(candidate);
  }
  close() {
    this.closed = true;
  }
}

const track = new FakeTrack();
const stream = { getTracks: () => [track], getAudioTracks: () => [track] };

function makeRuntime() {
  const inCall = {
    start: jest.fn(),
    stop: jest.fn(),
    setKeepScreenOn: jest.fn(),
    setForceSpeakerphoneOn: jest.fn(),
    startRingtone: jest.fn(),
    stopRingtone: jest.fn(),
    stopRingback: jest.fn(),
  };
  const runtime = {
    webrtc: {
      RTCPeerConnection: FakePeer,
      RTCSessionDescription: class {
        constructor(init: object) {
          Object.assign(this, init);
        }
      },
      RTCIceCandidate: class {
        constructor(init: object) {
          Object.assign(this, init);
        }
      },
      mediaDevices: { getUserMedia: jest.fn(async () => stream) },
    },
    inCall,
  } as unknown as CallRuntime;
  return { runtime, inCall };
}

let now = Date.parse("2026-10-08T08:00:00.000Z");

function call(overrides: Partial<OrderCall> = {}): OrderCall {
  return {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
    orderId: "ord_1",
    pair: "pickup",
    state: "ringing",
    caller: { firstName: "Shop", role: "supplier" },
    callee: { firstName: "Jun", role: "rider" },
    mine: true,
    createdAt: new Date(now).toISOString(),
    ringExpiresAt: new Date(now + 30_000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

function makeApi(overrides: Partial<Record<keyof CallApi, jest.Mock>> = {}): jest.Mocked<CallApi> {
  return {
    startCall: jest.fn(async () => call()),
    listCalls: jest.fn(async () => []),
    getCall: jest.fn(async () => call()),
    callAction: jest.fn(async (_order: string, _id: string, action: string) =>
      call({ state: action === "accept" || action === "heartbeat" ? "accepted" : action === "decline" ? "declined" : action === "cancel" ? "cancelled" : "ended" }),
    ),
    sendCallSignal: jest.fn(async () => undefined),
    getCallSignals: jest.fn(async () => ({ signals: [], cursor: 0, call: call() })),
    getCallIceServers: jest.fn(async () => [{ urls: ["stun:stun.example.test:19302"] }]),
    ...overrides,
  } as jest.Mocked<CallApi>;
}

async function flush() {
  for (let i = 0; i < 10; i += 1) await Promise.resolve();
}

async function advance(ms: number) {
  now += ms;
  await jest.advanceTimersByTimeAsync(ms);
  await flush();
}

function session(apiFake: jest.Mocked<CallApi>, runtime: CallRuntime) {
  const snapshots: CallSnapshot[] = [];
  const s = new CallSession("ord_1", "Jun", runtime, (snapshot) => snapshots.push(snapshot), {
    api: apiFake,
    now: () => now,
  });
  return { s, snapshots, phases: () => snapshots.map((snapshot) => snapshot.phase) };
}

beforeEach(() => {
  jest.useFakeTimers();
  now = Date.parse("2026-10-08T08:00:00.000Z");
  track.enabled = true;
  track.stopped = false;
  FakePeer.last = null;
});

afterEach(() => {
  jest.useRealTimers();
});

describe("placing a call", () => {
  it("rings, offers audio only, connects on the rider's answer, and times the call", async () => {
    const { runtime, inCall } = makeRuntime();
    const apiFake = makeApi();
    const { s, phases } = session(apiFake, runtime);

    await s.startOutgoing();
    await flush();
    expect(apiFake.startCall).toHaveBeenCalledWith("ord_1", "pickup");
    expect(phases()).toEqual(expect.arrayContaining(["calling", "ringing"]));
    expect(inCall.start).toHaveBeenCalledWith({ media: "audio", ringback: "_DTMF_" });
    expect(runtime.webrtc.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true, video: false });
    expect(apiFake.getCallIceServers).toHaveBeenCalledWith("ord_1", call().id);
    expect(FakePeer.last?.config).toEqual({ iceServers: [{ urls: ["stun:stun.example.test:19302"] }] });
    expect(apiFake.sendCallSignal).toHaveBeenCalledWith("ord_1", call().id, expect.objectContaining({ clientId: "offer_1", kind: "offer" }));

    // Local candidates trickle in order, after the offer; gathering's end is an empty candidate.
    FakePeer.last!.emit("icecandidate", { candidate: { candidate: "candidate:1 1 UDP 1 192.0.2.1 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 } });
    FakePeer.last!.emit("icecandidate", { candidate: null });
    await flush();
    const sent = apiFake.sendCallSignal.mock.calls.map(([, , body]) => body.clientId);
    expect(sent).toEqual(["offer_1", "ice_1", "ice_2"]);
    expect(apiFake.sendCallSignal.mock.calls[2][2]).toEqual({ clientId: "ice_2", kind: "ice", candidate: "", sdpMid: null, sdpMLineIndex: null });

    // The rider accepts; their ICE arrives before their answer and waits for it.
    apiFake.getCallSignals.mockResolvedValue({ signals: [], cursor: 5, call: call({ state: "accepted" }) });
    apiFake.getCallSignals.mockResolvedValueOnce({
      signals: [
        { id: 4, kind: "ice", clientId: "ice_1", candidate: "candidate:2 1 UDP 1 192.0.2.2 1234 typ host", sdpMid: "0", sdpMLineIndex: 0 },
        { id: 5, kind: "answer", clientId: "answer_1", sdp: "v=0\r\n" },
      ],
      cursor: 5,
      call: call({ state: "accepted", acceptedAt: new Date(now).toISOString() }),
    });
    await advance(CALL_POLL_MS);
    expect(s.current.phase).toBe("connecting");
    expect(FakePeer.last!.remote).toEqual([expect.objectContaining({ type: "answer" })]);
    expect(FakePeer.last!.candidates).toHaveLength(1);
    expect(apiFake.getCallSignals).toHaveBeenLastCalledWith("ord_1", call().id, 0);

    FakePeer.last!.setIce("connected");
    expect(s.current.phase).toBe("connected");
    expect(s.current.connectedAt).toBe(now);
    expect(inCall.stopRingback).toHaveBeenCalled();

    // The next read starts after what was applied, and the lease is renewed.
    await advance(CALL_POLL_MS);
    expect(apiFake.getCallSignals).toHaveBeenLastCalledWith("ord_1", call().id, 5);
    await advance(CALL_HEARTBEAT_MS);
    expect(apiFake.callAction).toHaveBeenCalledWith("ord_1", call().id, "heartbeat");

    // Hanging up ends it on GRIDGO and releases everything here.
    await advance(10_000);
    await s.hangUp();
    expect(apiFake.callAction).toHaveBeenLastCalledWith("ord_1", call().id, "end");
    expect(s.current).toMatchObject({ phase: "ended", endReason: "ended", endedByMe: true });
    expect(s.current.durationMs).toBeGreaterThan(0);
    expect(track.stopped).toBe(true);
    expect(FakePeer.last!.closed).toBe(true);
    expect(inCall.stop).toHaveBeenCalled();
    expect(inCall.setKeepScreenOn).toHaveBeenLastCalledWith(false);
  });

  it("says the rider declined", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    apiFake.getCallSignals.mockResolvedValue({ signals: [], cursor: 0, call: call({ state: "declined" }) });
    await advance(CALL_POLL_MS);
    expect(s.current).toMatchObject({ phase: "ended", endReason: "declined", endedByMe: false });
    expect(track.stopped).toBe(true);
  });

  it("says nobody answered when the ring runs out", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    apiFake.getCallSignals.mockResolvedValue({ signals: [], cursor: 0, call: call({ state: "missed" }) });
    await advance(CALL_POLL_MS);
    expect(s.current.endReason).toBe("no_answer");
  });

  it("takes the ring back when the shop hangs up first", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    await s.hangUp();
    expect(apiFake.callAction).toHaveBeenCalledWith("ord_1", call().id, "cancel");
    expect(s.current).toMatchObject({ endReason: "cancelled", endedByMe: true });
  });

  it("ends a call whose audio path fails, and says the network was lost", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    apiFake.getCallSignals.mockResolvedValue({ signals: [], cursor: 0, call: call({ state: "accepted" }) });
    await advance(CALL_POLL_MS);
    FakePeer.last!.setIce("connected");
    FakePeer.last!.setIce("disconnected");
    expect(s.current.phase).toBe("reconnecting");
    await advance(RECONNECT_GIVE_UP_MS);
    expect(s.current.endReason).toBe("network_lost");
    expect(apiFake.callAction).toHaveBeenCalledWith("ord_1", call().id, "end");
  });

  it("recovers from a brief drop without ending", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    apiFake.getCallSignals.mockResolvedValue({ signals: [], cursor: 0, call: call({ state: "accepted" }) });
    await advance(CALL_POLL_MS);
    FakePeer.last!.setIce("connected");
    FakePeer.last!.setIce("disconnected");
    await advance(3_000);
    FakePeer.last!.setIce("connected");
    await advance(RECONNECT_GIVE_UP_MS);
    expect(s.current.phase).toBe("connected");
  });

  it("stops the microphone when the lease runs out unrenewed", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    apiFake.getCallSignals.mockResolvedValueOnce({ signals: [], cursor: 0, call: call({ state: "accepted" }) });
    await advance(CALL_POLL_MS);
    FakePeer.last!.setIce("connected");
    // GRIDGO is now unreachable: every heartbeat and read fails.
    apiFake.callAction.mockRejectedValue(new Error("Network request failed"));
    apiFake.getCallSignals.mockRejectedValue(new Error("Network request failed"));
    await advance(CALL_LEASE_MS + CALL_POLL_MS);
    expect(s.current.endReason).toBe("network_lost");
    expect(track.stopped).toBe(true);
  });

  it("says calling has closed when GRIDGO refuses the start", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi({ startCall: jest.fn(async () => { throw new ApiError(409, { error: "call_not_available" }); }) });
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    expect(s.current.endReason).toBe("not_available");
    expect(runtime.webrtc.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });

  it("says too many calls when GRIDGO rate-limits", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi({ startCall: jest.fn(async () => { throw new ApiError(429, { error: "too_many_requests" }); }) });
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    expect(s.current.endReason).toBe("too_many");
  });

  it("answers the rider instead when they are already ringing this shop", async () => {
    const { runtime, inCall } = makeRuntime();
    const theirs = call({ mine: false, caller: { firstName: "Jun", role: "rider" }, callee: { firstName: "Shop", role: "supplier" } });
    const apiFake = makeApi({
      startCall: jest.fn(async () => { throw new ApiError(409, { error: "call_already_active" }); }),
      listCalls: jest.fn(async () => [theirs]),
    });
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    expect(s.current.phase).toBe("incoming");
    expect(inCall.startRingtone).toHaveBeenCalled();
  });

  it("puts down a call of its own left by a closed app, then starts once more", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi({
      startCall: jest
        .fn()
        .mockRejectedValueOnce(new ApiError(409, { error: "call_already_active" }))
        .mockResolvedValueOnce(call({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" })),
      listCalls: jest.fn(async () => [call()]),
    });
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    expect(apiFake.callAction).toHaveBeenCalledWith("ord_1", call().id, "cancel");
    expect(apiFake.startCall).toHaveBeenCalledTimes(2);
    expect(s.current.phase).toBe("ringing");
  });
});

describe("receiving a call", () => {
  const theirs = () =>
    call({ mine: false, caller: { firstName: "Jun", role: "rider" }, callee: { firstName: "Shop", role: "supplier" } });

  it("rings with the phone's own ringtone, for no longer than the ring", async () => {
    const { runtime, inCall } = makeRuntime();
    const { s } = session(makeApi(), runtime);
    s.receive(theirs());
    expect(s.current).toMatchObject({ phase: "incoming", otherName: "Jun" });
    expect(inCall.startRingtone).toHaveBeenCalledWith("_DEFAULT_", expect.any(Array), "playback", 30);
  });

  it("accepts, answers the rider's offer, and applies ICE only after it", async () => {
    const { runtime, inCall } = makeRuntime();
    const apiFake = makeApi({
      callAction: jest.fn(async () => call({ ...theirs(), state: "accepted" })),
      getCallSignals: jest.fn(async () => ({
        signals: [
          { id: 1, kind: "offer" as const, clientId: "offer_1", sdp: "v=0\r\n" },
          { id: 2, kind: "ice" as const, clientId: "ice_1", candidate: "candidate:1 1 UDP 1 192.0.2.1 1 typ host", sdpMid: "0", sdpMLineIndex: 0 },
        ],
        cursor: 2,
        call: call({ ...theirs(), state: "accepted" }),
      })),
    });
    const { s } = session(apiFake, runtime);
    s.receive(theirs());
    await s.accept();
    await flush();
    expect(inCall.stopRingtone).toHaveBeenCalled();
    expect(apiFake.callAction).toHaveBeenCalledWith("ord_1", call().id, "accept");
    expect(FakePeer.last!.remote).toEqual([expect.objectContaining({ type: "offer" })]);
    expect(FakePeer.last!.candidates).toHaveLength(1);
    expect(apiFake.sendCallSignal).toHaveBeenCalledWith("ord_1", call().id, expect.objectContaining({ clientId: "answer_1", kind: "answer" }));
  });

  it("declines without opening the microphone", async () => {
    const { runtime, inCall } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    s.receive(theirs());
    await s.decline();
    expect(apiFake.callAction).toHaveBeenCalledWith("ord_1", call().id, "decline");
    expect(inCall.stopRingtone).toHaveBeenCalled();
    expect(runtime.webrtc.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(s.current).toMatchObject({ phase: "ended", endedByMe: true });
  });

  it("stops ringing and says missed when the rider gives up", async () => {
    const { runtime, inCall } = makeRuntime();
    const apiFake = makeApi({ getCall: jest.fn(async () => call({ ...theirs(), state: "cancelled" })) });
    const { s } = session(apiFake, runtime);
    s.receive(theirs());
    await advance(CALL_POLL_MS);
    expect(s.current.endReason).toBe("missed");
    expect(inCall.stopRingtone).toHaveBeenCalled();
  });

  it("an accept that comes too late reads what the call became", async () => {
    const { runtime } = makeRuntime();
    const apiFake = makeApi({
      callAction: jest.fn(async () => { throw new ApiError(409, { error: "invalid_call_transition" }); }),
      getCall: jest.fn(async () => call({ ...theirs(), state: "missed" })),
    });
    const { s } = session(apiFake, runtime);
    s.receive(theirs());
    await s.accept();
    expect(s.current.endReason).toBe("missed");
    expect(runtime.webrtc.mediaDevices.getUserMedia).not.toHaveBeenCalled();
  });
});

describe("controls", () => {
  it("mutes the microphone track and routes to the speaker", async () => {
    const { runtime, inCall } = makeRuntime();
    const apiFake = makeApi();
    const { s } = session(apiFake, runtime);
    await s.startOutgoing();
    s.setMuted(true);
    expect(track.enabled).toBe(false);
    expect(s.current.muted).toBe(true);
    s.setSpeaker(true);
    expect(inCall.setForceSpeakerphoneOn).toHaveBeenLastCalledWith(true);
    s.setMuted(false);
    expect(track.enabled).toBe(true);
  });
});
