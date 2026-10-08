import { act, render } from "@testing-library/react-native";
import { router } from "expo-router";

import { useIncomingCallScreen } from "@/hooks/useIncomingCallScreen";
import type { CallSnapshot } from "@/lib/callSession";
import { useCall } from "@/store/call";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useRootNavigationState: () => ({ key: "root" }),
}));

function Host({ enabled = true }: { enabled?: boolean }) {
  useIncomingCallScreen(enabled);
  return null;
}

const ringing: CallSnapshot = {
  orderId: "ord_1",
  phase: "incoming",
  call: {
    id: "e115b493-dee1-448f-b6ba-a9868f448df2",
    orderId: "ord_1",
    pair: "pickup",
    state: "ringing",
    caller: { firstName: "Jun", role: "rider" },
    callee: { firstName: "Shop", role: "supplier" },
    mine: false,
    createdAt: "2026-10-08T08:00:00.000Z",
    ringExpiresAt: "2099-10-08T08:00:30.000Z",
    acceptedAt: null,
    endedAt: null,
    leaseExpiresAt: null,
  },
  otherName: "Jun",
  muted: false,
  speaker: false,
  connectedAt: null,
  endReason: null,
  endedByMe: false,
  durationMs: null,
};

beforeEach(() => {
  useSession.setState({ user: { id: "user_supplier" } as never });
});

afterEach(() => {
  useCall.setState({ snapshot: null, screenOpen: false, presented: null });
  jest.clearAllMocks();
});

describe("putting up the call screen", () => {
  it("opens the call screen once when the rider's call rings, without re-rendering the root forever", async () => {
    await render(<Host />);
    await act(async () => {
      useCall.setState({ snapshot: ringing });
    });
    // A later, unrelated store change must not push it again.
    await act(async () => {
      useCall.setState({ mic: "granted" });
    });
    expect(router.push).toHaveBeenCalledTimes(1);
    expect(router.push).toHaveBeenCalledWith({ pathname: "/call", params: { orderId: "ord_1", mode: "incoming" } });
  });

  it("leaves it to the screen already showing the call", async () => {
    useCall.setState({ screenOpen: true });
    await render(<Host />);
    await act(async () => {
      useCall.setState({ snapshot: ringing });
    });
    expect(router.push).not.toHaveBeenCalled();
  });

  it("does nothing for a shop that cannot take jobs yet", async () => {
    await render(<Host enabled={false} />);
    await act(async () => {
      useCall.setState({ snapshot: ringing });
    });
    expect(router.push).not.toHaveBeenCalled();
  });
});
