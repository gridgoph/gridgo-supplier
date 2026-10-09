import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import CallScreen from "@/app/call";
import * as api from "@/lib/api";
import { setCallRuntimeForTests } from "@/lib/callRuntime";
import type { CallSnapshot } from "@/lib/callSession";
import { DOWNLOAD_PAGE_URL } from "@/lib/appUpdate";
import { useCall } from "@/store/call";

const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { orderId: "ord_1", mode: "start", name: "Jun" };

jest.mock("expo-router", () => ({
  router: { back: () => mockBack(), replace: (to: unknown) => mockReplace(to), canGoBack: () => true },
  useLocalSearchParams: () => mockParams,
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listCalls: jest.fn(async () => []),
  startCall: jest.fn(),
}));

jest.mock("@/lib/microphone", () => ({
  readMicPermission: jest.fn(async () => "prompt"),
  requestMicPermission: jest.fn(async () => "blocked"),
  openMicSettings: jest.fn(),
}));

function snapshot(partial: Partial<CallSnapshot>): CallSnapshot {
  return {
    orderId: "ord_1",
    phase: "ringing",
    call: null,
    otherName: "Jun",
    muted: false,
    speaker: false,
    connectedAt: null,
    endReason: null,
    endedByMe: false,
    durationMs: null,
    ...partial,
  };
}

/** Render with the store already holding a call, as the screen finds it when one is under way. */
async function renderWith(state: Partial<CallSnapshot>, mic: "granted" | "prompt" | "blocked" = "granted") {
  // An ended call is one that ended on screen: open it live, then end it.
  useCall.setState({ snapshot: snapshot(state.phase === "ended" ? { phase: "connected" } : state), mic });
  await render(<CallScreen />);
  await act(async () => {});
  if (state.phase === "ended") {
    await act(async () => {
      useCall.setState({ snapshot: snapshot(state) });
    });
  }
}

beforeEach(() => {
  mockParams = { orderId: "ord_1", mode: "start", name: "Jun" };
});

afterEach(() => {
  useCall.setState({ snapshot: null, mic: null, screenOpen: false, presented: null, rung: [] });
  setCallRuntimeForTests(undefined);
  jest.clearAllMocks();
});

describe("call screen", () => {
  it("says where the call is, never a number, with mute, speaker and end", async () => {
    await renderWith({ phase: "ringing" });
    expect(screen.getByText("Jun")).toBeTruthy();
    expect(screen.getByText("Ringing…")).toBeTruthy();
    expect(screen.getByText("Internet call. Your number stays private.")).toBeTruthy();
    expect(screen.getByLabelText("Mute")).toBeTruthy();
    expect(screen.getByLabelText("Speaker")).toBeTruthy();
    expect(screen.getByLabelText("End call")).toBeTruthy();
  });

  it.each([
    ["calling", "Calling…"],
    ["connecting", "Connecting…"],
    ["reconnecting", "Reconnecting…"],
  ] as const)("labels %s", async (phase, words) => {
    await renderWith({ phase });
    expect(screen.getByText(words)).toBeTruthy();
  });

  it("runs a timer once connected", async () => {
    await renderWith({ phase: "connected", connectedAt: Date.now() - 65_000 });
    expect(screen.getByText("1:05")).toBeTruthy();
  });

  it("shows Accept and Decline for the rider's call, and says the microphone will be asked for", async () => {
    mockParams = { orderId: "ord_1", mode: "incoming" };
    await renderWith({ phase: "incoming" }, "prompt");
    expect(screen.getByText("Incoming call")).toBeTruthy();
    expect(screen.getByLabelText("Accept")).toBeTruthy();
    expect(screen.getByLabelText("Decline")).toBeTruthy();
    expect(screen.getByText(/GRIDGO will ask to use your microphone/)).toBeTruthy();
  });

  it("explains the microphone, and offers settings once the phone refuses it", async () => {
    await renderWith({ phase: "permission" }, "prompt");
    expect(screen.getByText("Allow the microphone for calls")).toBeTruthy();
    await fireEvent.press(screen.getByText("Allow microphone"));
    expect(await screen.findByText("Microphone is off for GRIDGO")).toBeTruthy();
    expect(screen.getByText("Open phone settings")).toBeTruthy();
    expect(api.startCall).not.toHaveBeenCalled();
  });

  it("tells an Expo Go build where the app that calls is, instead of crashing", async () => {
    setCallRuntimeForTests(null);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(true);
    await render(<CallScreen />);
    await act(async () => {});
    expect(await screen.findByText("Calls need the latest GRIDGO app from the download page")).toBeTruthy();
    await fireEvent.press(screen.getByText("Open the download page"));
    expect(open).toHaveBeenCalledWith(DOWNLOAD_PAGE_URL);
  });

  it.each([
    ["declined", "Call declined"],
    ["no_answer", "Not answered"],
    ["missed", "Missed call from Jun"],
    ["network_lost", "Call dropped"],
    ["not_available", "Calling has closed"],
  ] as const)("gives a clear reason when the call ends: %s", async (endReason, title) => {
    await renderWith({ phase: "ended", endReason });
    expect(screen.getByTestId("call-end-title").props.children).toBe(title);
    expect(screen.getByText("Message Jun")).toBeTruthy();
  });

  it("offers to call back after a missed call", async () => {
    await renderWith({ phase: "ended", endReason: "missed" });
    expect(screen.getByText("Call back")).toBeTruthy();
  });

  it("closes itself when the shop declines", async () => {
    await renderWith({ phase: "ended", endReason: "missed", endedByMe: true });
    expect(mockBack).toHaveBeenCalled();
  });

  it("sends a stale incoming push to the job instead of ringing", async () => {
    mockParams = { orderId: "ord_1", mode: "incoming" };
    setCallRuntimeForTests({ webrtc: {}, inCall: null } as never);
    await render(<CallScreen />);
    await act(async () => {});
    expect(api.listCalls).toHaveBeenCalledWith("ord_1");
    expect(mockReplace).toHaveBeenCalledWith({ pathname: "/job/[id]", params: { id: "ord_1" } });
  });
});
