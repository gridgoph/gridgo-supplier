import * as api from "@/lib/api";
import { setCallRuntimeForTests, type CallRuntime } from "@/lib/callRuntime";
import { readMicPermission, requestMicPermission } from "@/lib/microphone";
import type { OrderCall } from "@/lib/orderCall";
import { useCall } from "@/store/call";

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listCalls: jest.fn(),
  callAction: jest.fn(),
  startCall: jest.fn(),
  getCall: jest.fn(),
  getCallSignals: jest.fn(),
  getCallIceServers: jest.fn(),
  sendCallSignal: jest.fn(),
}));

jest.mock("@/lib/microphone", () => ({
  readMicPermission: jest.fn(),
  requestMicPermission: jest.fn(),
  openMicSettings: jest.fn(),
}));

function ringing(overrides: Partial<OrderCall> = {}): OrderCall {
  const now = Date.now();
  return {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
    orderId: "ord_1",
    pair: "pickup",
    state: "ringing",
    caller: { firstName: "Jun", role: "rider" },
    callee: { firstName: "Shop", role: "supplier" },
    mine: false,
    createdAt: new Date(now - 2_000).toISOString(),
    ringExpiresAt: new Date(now + 28_000).toISOString(),
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
    ...overrides,
  };
}

const inCall = {
  start: jest.fn(),
  stop: jest.fn(),
  setKeepScreenOn: jest.fn(),
  setForceSpeakerphoneOn: jest.fn(),
  startRingtone: jest.fn(),
  stopRingtone: jest.fn(),
  stopRingback: jest.fn(),
};
const runtime = { webrtc: {}, inCall } as unknown as CallRuntime;

beforeEach(() => {
  jest.useFakeTimers();
  setCallRuntimeForTests(runtime);
  jest.mocked(readMicPermission).mockResolvedValue("granted");
  jest.mocked(api.callAction).mockResolvedValue(ringing({ state: "declined" }));
});

afterEach(() => {
  useCall.getState().reset();
  setCallRuntimeForTests(undefined);
  jest.clearAllMocks();
  jest.useRealTimers();
});

describe("finding an incoming call", () => {
  it("rings for the rider's live call, once", async () => {
    jest.mocked(api.listCalls).mockResolvedValue([ringing()]);
    await expect(useCall.getState().checkIncoming("ord_1")).resolves.toBe(true);
    expect(useCall.getState().snapshot).toMatchObject({ phase: "incoming", otherName: "Jun" });
    expect(inCall.startRingtone).toHaveBeenCalledTimes(1);

    // The same call reported again (push, stream and inbox all say so): no second ring.
    await expect(useCall.getState().checkIncoming("ord_1")).resolves.toBe(false);
    expect(inCall.startRingtone).toHaveBeenCalledTimes(1);
  });

  it("never rings for a stale push", async () => {
    jest.mocked(api.listCalls).mockResolvedValue([ringing({ state: "missed" })]);
    await expect(useCall.getState().checkIncoming("ord_1")).resolves.toBe(false);
    jest.mocked(api.listCalls).mockResolvedValue([ringing({ ringExpiresAt: new Date(Date.now() - 1).toISOString() })]);
    await expect(useCall.getState().checkIncoming("ord_1")).resolves.toBe(false);
    jest.mocked(api.listCalls).mockResolvedValue([ringing({ mine: true })]);
    await expect(useCall.getState().checkIncoming("ord_1")).resolves.toBe(false);
    expect(useCall.getState().snapshot).toBeNull();
    expect(inCall.startRingtone).not.toHaveBeenCalled();
  });

  it("declines a second call while already on one", async () => {
    jest.mocked(api.listCalls).mockResolvedValueOnce([ringing()]);
    await useCall.getState().checkIncoming("ord_1");
    const second = ringing({ id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", orderId: "ord_2" });
    jest.mocked(api.listCalls).mockResolvedValueOnce([second]);
    await expect(useCall.getState().checkIncoming("ord_2")).resolves.toBe(false);
    expect(api.callAction).toHaveBeenCalledWith("ord_2", second.id, "decline");
    expect(useCall.getState().snapshot?.orderId).toBe("ord_1");
  });

  it("looks only at inbox records young enough to still be ringing", () => {
    jest.mocked(api.listCalls).mockResolvedValue([]);
    const now = Date.now();
    useCall.getState().noticeIncoming([
      { type: "order_call_incoming", orderId: "ord_new", at: new Date(now - 3_000).toISOString() },
      { type: "order_call_incoming", orderId: "ord_old", at: new Date(now - 10 * 60_000).toISOString() },
      { type: "order_call_missed", orderId: "ord_missed", at: new Date(now).toISOString() },
    ]);
    expect(api.listCalls).toHaveBeenCalledTimes(1);
    expect(api.listCalls).toHaveBeenCalledWith("ord_new");
  });
});

describe("placing a call", () => {
  it("explains the microphone before asking, and asks nothing of GRIDGO yet", async () => {
    jest.mocked(readMicPermission).mockResolvedValue("prompt");
    await useCall.getState().start("ord_1", "Jun");
    expect(useCall.getState().snapshot).toMatchObject({ phase: "permission", otherName: "Jun" });
    expect(api.startCall).not.toHaveBeenCalled();
  });

  it("keeps a refused microphone a refusal, and still never starts a call", async () => {
    jest.mocked(readMicPermission).mockResolvedValue("prompt");
    jest.mocked(requestMicPermission).mockResolvedValue("blocked");
    await useCall.getState().start("ord_1", "Jun");
    await expect(useCall.getState().askMic()).resolves.toBe("blocked");
    expect(useCall.getState().mic).toBe("blocked");
    expect(api.startCall).not.toHaveBeenCalled();
  });

  it("does not accept a call when the microphone is refused", async () => {
    jest.mocked(api.listCalls).mockResolvedValue([ringing()]);
    jest.mocked(readMicPermission).mockResolvedValue("prompt");
    jest.mocked(requestMicPermission).mockResolvedValue("prompt");
    await useCall.getState().checkIncoming("ord_1");
    await useCall.getState().accept();
    expect(api.callAction).not.toHaveBeenCalledWith("ord_1", expect.any(String), "accept");
    expect(useCall.getState().snapshot?.phase).toBe("incoming");
  });
});

describe("a build without the calling module (Expo Go)", () => {
  it("says calls need the latest app instead of crashing, and never rings", async () => {
    setCallRuntimeForTests(null);
    await useCall.getState().start("ord_1", "Jun");
    expect(useCall.getState().snapshot?.phase).toBe("unsupported");
    expect(api.startCall).not.toHaveBeenCalled();

    useCall.getState().reset();
    jest.mocked(api.listCalls).mockResolvedValue([ringing()]);
    await expect(useCall.getState().checkIncoming("ord_1")).resolves.toBe(false);
    expect(api.listCalls).not.toHaveBeenCalled();
  });
});
