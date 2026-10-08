import { act, render, screen } from "@testing-library/react-native";

import { RiderApproachPanel } from "@/components/RiderApproachPanel";
import { getRiderApproach } from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";
import { fetchRoute } from "@/lib/osrm";
import { APPROACH_POLL_MS } from "@/lib/riderApproach";

jest.mock("expo-router", () => ({
  useFocusEffect: (effect: () => void | (() => void)) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(effect, [effect]);
  },
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getRiderApproach: jest.fn(),
}));

jest.mock("@/lib/osrm", () => ({
  ...jest.requireActual("@/lib/osrm"),
  fetchRoute: jest.fn(),
}));

const SHOP = { lat: 7.0731, lng: 125.6128 };
const NOW = Date.parse("2026-10-08T06:00:00.000Z");
const ago = (seconds: number) => new Date(NOW - seconds * 1000).toISOString();

beforeEach(() => {
  jest.useFakeTimers({ now: NOW });
  jest.mocked(fetchRoute).mockResolvedValue({
    routed: true,
    distanceMetres: 2400,
    durationSeconds: 540,
    coordinates: [
      [125.6, 7.09],
      [SHOP.lng, SHOP.lat],
    ],
  });
});

afterEach(() => {
  jest.useRealTimers();
  jest.resetAllMocks();
});

async function renderPanel(onPickedUp = jest.fn()) {
  await render(<RiderApproachPanel orderId="ord_1" shopPin={SHOP} riderFirstName="Jun" onPickedUp={onPickedUp} />);
  await act(async () => {});
  return onPickedUp;
}

describe("RiderApproachPanel", () => {
  it("shows the rider, the route, how far and how fresh", async () => {
    jest.mocked(getRiderApproach).mockResolvedValue({
      ping: { lat: 7.09, lng: 125.6, at: ago(20) },
      shop: SHOP,
      hidden: null,
    });
    await renderPanel();

    expect(await screen.findByText("Jun is about 9 min away")).toBeTruthy();
    expect(screen.getByText("2.4 km by road from your shop")).toBeTruthy();
    expect(screen.getByText("Updated 20 s ago")).toBeTruthy();
    expect(screen.getByLabelText("Map of Jun's way to your shop")).toBeTruthy();
    expect(fetchRoute).toHaveBeenCalledWith({ lat: 7.09, lng: 125.6, at: ago(20) }, SHOP);
  });

  it("says when the rider has not shared a location yet, and still draws the shop", async () => {
    jest.mocked(getRiderApproach).mockResolvedValue({ ping: null, shop: SHOP, hidden: null });
    await renderPanel();

    expect(await screen.findByText("Jun has not shared a location yet")).toBeTruthy();
    expect(screen.getByText("No location yet")).toBeTruthy();
    expect(screen.getByLabelText("Map of Jun's way to your shop")).toBeTruthy();
    expect(fetchRoute).not.toHaveBeenCalled();
  });

  it("says an old position is old", async () => {
    jest.mocked(getRiderApproach).mockResolvedValue({
      ping: { lat: 7.09, lng: 125.6, at: ago(6 * 60) },
      shop: SHOP,
      hidden: null,
    });
    await renderPanel();

    expect(await screen.findByText("Jun was last seen 6 min ago")).toBeTruthy();
    expect(screen.getByText("Last seen 6 min ago")).toBeTruthy();
  });

  it("polls while on screen and stops when it leaves", async () => {
    jest.mocked(getRiderApproach).mockResolvedValue({ ping: null, shop: SHOP, hidden: null });
    await renderPanel();
    expect(getRiderApproach).toHaveBeenCalledTimes(1);

    await act(async () => {
      jest.advanceTimersByTime(APPROACH_POLL_MS);
    });
    expect(getRiderApproach).toHaveBeenCalledTimes(2);

    await act(async () => {
      await screen.unmount();
    });
    await act(async () => {
      jest.advanceTimersByTime(APPROACH_POLL_MS * 3);
    });
    expect(getRiderApproach).toHaveBeenCalledTimes(2);
  });

  it("hands back to the job once GRIDGO says the rider has it", async () => {
    jest.mocked(getRiderApproach).mockResolvedValue({ ping: null, shop: SHOP, hidden: "picked_up" });
    const onPickedUp = await renderPanel();
    expect(onPickedUp).toHaveBeenCalled();
  });

  it("draws nothing on a deployment that does not share the position", async () => {
    jest.mocked(getRiderApproach).mockRejectedValue(new ApiError(404, { error: "not_found" }));
    await renderPanel();
    expect(screen.queryByTestId("rider-approach")).toBeNull();
  });

  it("keeps the last answer and says a check failed", async () => {
    jest.mocked(getRiderApproach)
      .mockResolvedValueOnce({ ping: { lat: 7.09, lng: 125.6, at: ago(20) }, shop: SHOP, hidden: null })
      .mockRejectedValueOnce(new Error("offline"));
    await renderPanel();
    expect(await screen.findByText("Jun is about 9 min away")).toBeTruthy();

    await act(async () => {
      jest.advanceTimersByTime(APPROACH_POLL_MS);
    });
    expect(screen.getByText(/Could not check for a newer position/)).toBeTruthy();
    expect(screen.getByText("2.4 km by road from your shop")).toBeTruthy();
  });
});
