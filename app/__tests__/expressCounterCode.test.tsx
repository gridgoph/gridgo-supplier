import { act, fireEvent, render, screen } from "@testing-library/react-native";

import CounterCodeScreen from "@/app/job/[id]/counter-code";
import { ExpressCountdown } from "@/components/ExpressCountdown";
import * as api from "@/lib/api";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_x" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOrder: jest.fn(),
  enterCounterCode: jest.fn(),
}));

const ready = {
  id: "ord_x", title: "Express print", state: "ready_for_dispatch", timeline: [],
  clientId: "client_1", supplierId: "shop", riderId: null, productId: "p",
  quantity: 1, size: "", material: "", deadline: null, address: "", zone: "",
  totalMinor: 1000, deliveryFeeMinor: 0, paymentMethod: null, paymentStatus: "paid",
  promisedDate: null, artworkName: null, createdAt: "2026-11-19T02:00:00Z", updatedAt: "2026-11-19T02:00:00Z",
  orderType: "express", fulfillmentMode: "pickup",
  expressOrder: { status: "ready", printSettings: [] },
} as api.Order;

beforeEach(() => {
  jest.clearAllMocks();
  (api.getOrder as jest.Mock).mockResolvedValue(ready);
});

describe("counter code entry", () => {
  it("sends the code on the sixth digit, leading zero kept, and says it is handed over", async () => {
    (api.enterCounterCode as jest.Mock).mockResolvedValue(undefined);
    const view = await render(<CounterCodeScreen />);
    const input = await screen.findByTestId("counter-code-input");
    await fireEvent.changeText(input, "012345");
    expect(api.enterCounterCode).toHaveBeenCalledWith("ord_x", "012345");
    expect(await screen.findByTestId("counter-code-done")).toBeTruthy();
    expect(screen.getByText("Handed over")).toBeTruthy();
    await view.unmount();
  });

  it("marks a wrong code and starts fresh on the next digit", async () => {
    (api.enterCounterCode as jest.Mock).mockRejectedValue(new api.ApiError(409, { error: "express_pickup_code_mismatch" }));
    const view = await render(<CounterCodeScreen />);
    const input = await screen.findByTestId("counter-code-input");
    await fireEvent.changeText(input, "111111");
    expect(await screen.findByTestId("counter-code-wrong")).toBeTruthy();
    expect(input.props.value).toBe("");
    await fireEvent.changeText(input, "2");
    expect(screen.queryByTestId("counter-code-wrong")).toBeNull();
    expect(input.props.value).toBe("2");
    await view.unmount();
  });

  it("locks the boxes after too many tries and shows the time left", async () => {
    const retryAfter = new Date(Date.now() + 14 * 60_000 + 30_000).toISOString();
    (api.enterCounterCode as jest.Mock).mockRejectedValue(
      new api.ApiError(429, { error: "express_pickup_attempts_exceeded", retryAfter }),
    );
    const view = await render(<CounterCodeScreen />);
    const input = await screen.findByTestId("counter-code-input");
    await fireEvent.changeText(input, "999999");
    expect(await screen.findByTestId("counter-code-locked")).toBeTruthy();
    expect(screen.getByText("Too many tries")).toBeTruthy();
    expect(screen.getByText(/Try again in 14:(29|30)/)).toBeTruthy();
    expect(input.props.editable).toBe(false);
    await view.unmount();
  });

  it("does not ask for a code on an order that is not at the counter", async () => {
    (api.getOrder as jest.Mock).mockResolvedValue({ ...ready, expressOrder: { status: "picked_up" } });
    const view = await render(<CounterCodeScreen />);
    expect(await screen.findByText("Already handed over.")).toBeTruthy();
    expect(screen.queryByTestId("counter-code-input")).toBeNull();
    await view.unmount();
  });
});

describe("Express countdown", () => {
  const assignedAt = "2026-11-19T02:00:00.000Z";
  const order = {
    state: "supplier_assigned",
    shopRecovery: null,
    shopAcceptance: { assignedAt, deadlineAt: "2026-11-19T02:05:00.000Z", workingMinutes: 5, status: "pending" as const },
  };

  beforeEach(() => jest.useFakeTimers({ now: new Date(assignedAt) }));
  afterEach(() => jest.useRealTimers());

  it("counts down to the next shop and fires once at zero", async () => {
    const onExpire = jest.fn();
    const view = await render(<ExpressCountdown order={order} onExpire={onExpire} />);
    expect(screen.getByTestId("express-countdown-time").props.children).toBe("5:00");
    expect(screen.getByText("Next shop at 0:00")).toBeTruthy();

    await act(async () => { jest.advanceTimersByTime(4 * 60_000 + 30_000); });
    expect(screen.getByTestId("express-countdown-time").props.children).toBe("0:30");
    expect(screen.getByText("Last minute")).toBeTruthy();

    await act(async () => { jest.advanceTimersByTime(31_000); });
    expect(screen.getByText("Sent to the next shop")).toBeTruthy();
    expect(onExpire).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});
