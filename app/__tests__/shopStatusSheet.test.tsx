import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getShopStatus: jest.fn(),
  updateShopStatus: jest.fn(),
  getShopHours: jest.fn(),
}));

import ShopStatusSheet from "@/app/shop-status";
import { getShopHours, getShopStatus, updateShopStatus } from "@/lib/api";
import { useSession } from "@/store/session";
import { useShopStatus } from "@/store/shopStatus";

function body(version: number, overrides: Record<string, unknown> = {}) {
  return {
    version,
    hours: { version, schedule: { week: [], closures: [] }, temporarilyClosed: false },
    todayHours: [{ opensMinute: 480, closesMinute: 1080 }],
    isOpenNow: true,
    nextOpeningAt: null,
    expressEnabled: true,
    nightJobs: "off",
    nightWindow: null,
    printerDemandPings: false,
    pausedUntil: null,
    ...overrides,
  };
}

const owner = {
  id: "u1",
  email: "owner@example.test",
  name: "Owner",
  role: "supplier" as const,
  supplierName: "Test shop",
  verificationStatus: "approved" as const,
};

describe("the shop status sheet", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    useShopStatus.getState().reset();
    (getShopStatus as jest.Mock).mockResolvedValue(body(2));
    (getShopHours as jest.Mock).mockResolvedValue({ hours: body(2).hours });
    useSession.setState({ user: owner });
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
    useSession.setState({ user: null });
  });

  it("switches Express off at once and says it took", async () => {
    (updateShopStatus as jest.Mock).mockResolvedValue(body(3, { expressEnabled: false }));
    view = await render(<ShopStatusSheet />);

    await fireEvent.press(await screen.findByRole("switch", { name: "Express jobs" }));

    expect(updateShopStatus).toHaveBeenCalledWith(2, { expressEnabled: false });
    expect(await screen.findByText(/Express is off/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Express jobs" }).props.accessibilityState.checked).toBe(false);
  });

  it("sets night jobs until 11 PM from the segmented choice", async () => {
    (updateShopStatus as jest.Mock).mockResolvedValue(body(3, { nightJobs: "until_23" }));
    view = await render(<ShopStatusSheet />);

    await fireEvent.press(await screen.findByText("11 PM"));

    expect(updateShopStatus).toHaveBeenCalledWith(2, { nightJobs: "until_23" });
    expect(await screen.findByText(/until 11 PM, after your closing time/)).toBeTruthy();
  });

  it("opts in to printer pings", async () => {
    (updateShopStatus as jest.Mock).mockResolvedValue(body(3, { printerDemandPings: true }));
    view = await render(<ShopStatusSheet />);

    await fireEvent.press(await screen.findByRole("switch", { name: "Ping me when clients need a printer" }));

    expect(updateShopStatus).toHaveBeenCalledWith(2, { printerDemandPings: true });
  });

  it("pauses for an hour, then offers Resume now", async () => {
    const until = new Date(Date.now() + 3600_000).toISOString();
    (updateShopStatus as jest.Mock)
      .mockResolvedValueOnce(body(3, { pausedUntil: until, isOpenNow: false }))
      .mockResolvedValueOnce(body(4));
    view = await render(<ShopStatusSheet />);

    await fireEvent.press(await screen.findByLabelText("Pause for 1 hour"));
    expect(updateShopStatus).toHaveBeenCalledWith(2, { pause: "one_hour" });
    expect(await screen.findByText(/Paused for 1 hour/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Resume now"));
    expect(updateShopStatus).toHaveBeenLastCalledWith(3, { pause: null });
    expect(await screen.findByText(/taking jobs again/)).toBeTruthy();
  });

  it("reloads and asks again when another phone changed the shop first", async () => {
    const { ApiError } = jest.requireActual("@/lib/api");
    (updateShopStatus as jest.Mock).mockRejectedValue(new ApiError(409, { error: "shop_profile_stale" }));
    (getShopStatus as jest.Mock).mockResolvedValueOnce(body(2)).mockResolvedValueOnce(body(7, { expressEnabled: false }));
    view = await render(<ShopStatusSheet />);

    await fireEvent.press(await screen.findByRole("switch", { name: "Express jobs" }));

    expect(await screen.findByText(/changed on another screen or phone/)).toBeTruthy();
    await waitFor(() =>
      expect(screen.getByRole("switch", { name: "Express jobs" }).props.accessibilityState.checked).toBe(false),
    );
  });

  it("shows Staff the status with every control held still", async () => {
    useSession.setState({ user: { ...owner, shopRole: "staff" } as typeof owner });
    view = await render(<ShopStatusSheet />);

    expect(await screen.findByText("Only the shop owner can change these.")).toBeTruthy();
    const express = screen.getByRole("switch", { name: "Express jobs" });
    expect(express.props.accessibilityState.disabled).toBe(true);
    await fireEvent.press(express);
    expect(updateShopStatus).not.toHaveBeenCalled();
  });
});
