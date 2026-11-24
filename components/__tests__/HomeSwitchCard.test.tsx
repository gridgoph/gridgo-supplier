import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import * as api from "@/lib/api";
import type { HomePrinterRead, HomeStatus } from "@/lib/homePrinter";
import { useHomePrinter } from "@/store/homePrinter";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));

jest.mock("@/lib/deviceLocation", () => ({ requestCurrentLocation: jest.fn() }));

jest.mock("@/lib/api", () => {
  const actual = jest.requireActual("@/lib/api");
  return { ...actual, patchHomePrinter: jest.fn(), getHomePrinter: jest.fn() };
});

import { HomeSwitchCard } from "@/components/home/HomeSwitchCard";
import { requestCurrentLocation } from "@/lib/deviceLocation";

const mocked = api as jest.Mocked<typeof api>;
const locate = requestCurrentLocation as jest.Mock;
const mockRouter = jest.requireMock("expo-router").router as { push: jest.Mock };

const STATUS: HomeStatus = {
  level: "starter",
  verified: false,
  online: false,
  offersPaused: true,
  reason: "home_offline",
  deadlineAt: null,
  weeklyJobs: 12,
  weeklyJobCap: 30,
  offlineUntil: null,
  allowHomePickup: false,
  pinConsentWording: "pin wording",
  filePrivacyWording: "file wording",
};

const PIN = { point: null, barangay: "Example barangay", street: "Example street", propertyType: "house" as const, landmark: null, nextChangeAt: null };

function read(status: Partial<HomeStatus>, version = 2): HomePrinterRead {
  return { version, status: { ...STATUS, ...status }, pin: PIN };
}

function body(status: Partial<HomeStatus>, version: number) {
  return { version, homePrinter: { ...STATUS, ...status }, pin: PIN };
}

beforeEach(() => {
  jest.clearAllMocks();
});

it("goes online with the phone's current position, and says so", async () => {
  useHomePrinter.setState({ home: read({}), error: null });
  locate.mockResolvedValue({ status: "ok", point: { lat: 7.06, lng: 125.6 } });
  mocked.patchHomePrinter.mockResolvedValue(body({ online: true, offersPaused: false, reason: null }, 3));

  await render(<HomeSwitchCard home={useHomePrinter.getState().home as HomePrinterRead} />);
  expect(screen.getByTestId("home-switch-label").props.children).toBe("Offline");
  expect(screen.getByText("12 of 30 jobs this week")).toBeTruthy();

  await fireEvent.press(screen.getByRole("switch"));
  await waitFor(() =>
    expect(mocked.patchHomePrinter).toHaveBeenCalledWith({ expectedVersion: 2, online: true, location: { lat: 7.06, lng: 125.6 } }),
  );
  const home = useHomePrinter.getState().home as HomePrinterRead;
  await render(<HomeSwitchCard home={home} />);
  expect(screen.getByText("You're online")).toBeTruthy();
});

it("tells the printer what to do when the phone gives no position, and sends nothing", async () => {
  useHomePrinter.setState({ home: read({}), error: null });
  locate.mockResolvedValue({ status: "denied", message: "Allow location to go online.", remedy: "retry" });
  await render(<HomeSwitchCard home={read({})} />);
  await fireEvent.press(screen.getByRole("switch"));
  expect(await screen.findByText("Allow location to go online.")).toBeTruthy();
  expect(mocked.patchHomePrinter).not.toHaveBeenCalled();
});

it("goes offline in one tap", async () => {
  const online = read({ online: true, offersPaused: false, reason: null });
  useHomePrinter.setState({ home: online, error: null });
  mocked.patchHomePrinter.mockResolvedValue(body({}, 3));
  await render(<HomeSwitchCard home={online} />);
  await fireEvent.press(screen.getByRole("switch"));
  await waitFor(() => expect(mocked.patchHomePrinter).toHaveBeenCalledWith({ expectedVersion: 2, online: false }));
  expect(locate).not.toHaveBeenCalled();
});

it("explains a pause away from home and keeps the switch on", async () => {
  // Online, with a fix GRIDGO measured too far from the pin.
  await render(<HomeSwitchCard home={read({ online: true, reason: "home_away_from_pin" })} />);
  expect(screen.getByText("Offers paused: you're away from home")).toBeTruthy();
  expect(screen.getByRole("switch").props.accessibilityState).toMatchObject({ checked: true });
});

it("does not let the switch clear a fair-play hold, and says when it ends", async () => {
  await render(<HomeSwitchCard home={read({ reason: "home_fair_play_hold", offlineUntil: "2026-11-25T14:00:00.000Z" })} />);
  expect(screen.getByText(/^Offers paused until /)).toBeTruthy();
  expect(screen.getByRole("switch").props.accessibilityState).toMatchObject({ disabled: true });
  await fireEvent.press(screen.getByRole("switch"));
  expect(mocked.patchHomePrinter).not.toHaveBeenCalled();
});

it("sends a capped Starter to Get Verified", async () => {
  await render(<HomeSwitchCard home={read({ online: true, reason: "home_weekly_cap", weeklyJobs: 30 })} />);
  expect(screen.getByText("30 of 30 jobs this week")).toBeTruthy();
  await fireEvent.press(screen.getByRole("button", { name: "Get Verified" }));
  expect(mockRouter.push).toHaveBeenCalledWith("/home-printer");
});

it("retries once on a stale version", async () => {
  useHomePrinter.setState({ home: read({ online: true, reason: null }), error: null });
  mocked.patchHomePrinter
    .mockRejectedValueOnce(new api.ApiError(409, { error: "shop_profile_stale" }))
    .mockResolvedValueOnce(body({}, 6));
  mocked.getHomePrinter.mockResolvedValue(body({ online: true, reason: null }, 5));
  await render(<HomeSwitchCard home={read({ online: true, reason: null })} />);
  await fireEvent.press(screen.getByRole("switch"));
  await waitFor(() => expect(mocked.patchHomePrinter).toHaveBeenLastCalledWith({ expectedVersion: 5, online: false }));
  expect(useHomePrinter.getState().home && useHomePrinter.getState().home).toMatchObject({ version: 6 });
});
