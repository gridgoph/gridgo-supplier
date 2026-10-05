import { invalidate } from "@/lib/live";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import AlertsScreen from "@/app/alerts";
import type { Notification } from "@/lib/api";
import { askConfirm } from "@/store/sheets";
import { useAlertsStore } from "@/store/alerts";
import { useAppUpdate } from "@/store/appUpdate";

const mockSetOptions = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(),
}));

jest.mock("@/components/PushEnableCard", () => ({
  PushEnableCard: () => null,
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listNotifications: jest.fn(),
  listJobs: jest.fn(),
  deleteNotification: jest.fn(),
}));

const api = jest.requireMock("@/lib/api") as {
  listNotifications: jest.Mock;
  listJobs: jest.Mock;
  deleteNotification: jest.Mock;
};

const mockAskConfirm = askConfirm as jest.MockedFunction<typeof askConfirm>;

const offer: Notification = {
  id: "ntf_1",
  userId: "user_supplier",
  title: "New job offered",
  body: "Grand opening tarpaulin is waiting for your price.",
  read: true,
  at: "2026-09-01T03:57:00.000Z",
};

describe("Alerts screen — Clear notifications", () => {
  beforeEach(() => {
    mockSetOptions.mockClear();
    mockAskConfirm.mockReset();
    api.listNotifications.mockReset();
    api.listJobs.mockReset();
    api.deleteNotification.mockReset();
    api.listNotifications.mockResolvedValue([offer]);
    api.listJobs.mockResolvedValue([]);
    api.deleteNotification.mockResolvedValue(undefined);
    useAlertsStore.setState({
      dismissed: [],
      deleted: [],
      unreadCount: 0,
      localOnly: false,
    });
  });

  it("hides the action when the inbox is already empty", async () => {
    api.listNotifications.mockResolvedValue([]);
    await render(<AlertsScreen />);

    expect(await screen.findByText("Nothing to catch up on")).toBeTruthy();
    expect(screen.queryByText("Clear notifications")).toBeNull();
  });

  it("offers Clear notifications once the inbox has something in it", async () => {
    await render(<AlertsScreen />);

    expect(await screen.findByText(offer.title)).toBeTruthy();
    expect(screen.getByText("Clear notifications")).toBeTruthy();
  });

  it("asks before deleting, and leaves the inbox when the shop keeps them", async () => {
    mockAskConfirm.mockResolvedValue(false);
    await render(<AlertsScreen />);
    await screen.findByText(offer.title);

    fireEvent.press(screen.getByText("Clear notifications"));

    await waitFor(() => expect(mockAskConfirm).toHaveBeenCalled());
    expect(mockAskConfirm).toHaveBeenCalledWith({
      question: "Clear all notifications?",
      consequence:
        "They go for good, and GRIDGO will not send them again. The jobs they are about are not affected — you can still open them from Jobs.",
      confirmLabel: "Clear notifications",
      cancelLabel: "Keep them",
      destructive: true,
    });
    expect(api.deleteNotification).not.toHaveBeenCalled();
    expect(screen.getByText(offer.title)).toBeTruthy();
  });

  it("deletes every alert on screen after the shop confirms", async () => {
    mockAskConfirm.mockResolvedValue(true);
    await render(<AlertsScreen />);
    await screen.findByText(offer.title);

    fireEvent.press(screen.getByText("Clear notifications"));

    await waitFor(() => expect(api.deleteNotification).toHaveBeenCalledWith("ntf_1"));
    expect(await screen.findByText("Nothing to catch up on")).toBeTruthy();
    expect(screen.queryByText("Clear notifications")).toBeNull();
    expect(screen.queryByText(offer.title)).toBeNull();
  });
});


it("updates the visible inbox from a silent notification event without navigation", async () => {
  api.listNotifications.mockResolvedValue([]);
  api.listJobs.mockResolvedValue([]);
  await render(<AlertsScreen />);
  await waitFor(() => expect(api.listNotifications).toHaveBeenCalled());
  const incoming = { id:"ntf_live", userId:"owner", title:"Live decision arrived", body:"Open your account", read:false, at:"2026-09-08T00:00:00Z" };
  api.listNotifications.mockResolvedValue([incoming]);
  await act(async () => { invalidate("notifications"); });
  expect(await screen.findByText("Live decision arrived")).toBeTruthy();
});

it("opens the job from a pickup-issue notice, in the shop's words, even before the job list has it", async () => {
  const { router } = jest.requireMock("expo-router") as { router: { push: jest.Mock } };
  router.push.mockClear();
  useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, localOnly: false });
  api.listNotifications.mockResolvedValue([{
    id: "ntf_pickup",
    userId: "user_supplier",
    type: "shop_pickup_issue_changed",
    orderId: "ord_blocked",
    title: "Fix the failed pickup check before handoff",
    body: "quantity_match: One tarp missing. Fix these items with Operations before the rider repeats the checks and count.",
    read: false,
    at: "2026-09-27T06:14:00.000Z",
  }]);
  api.listJobs.mockResolvedValue([]);

  await render(<AlertsScreen />);

  const body = await screen.findByText(/Did not pass: count against the order\. The rider wrote: “One tarp missing\.”/);
  expect(screen.queryByText(/quantity_match/)).toBeNull();
  fireEvent.press(body);
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect(JSON.stringify(router.push.mock.calls[0][0])).toContain("ord_blocked");
});

it("rewrites a refund notice for the shop and opens its job", async () => {
  useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, localOnly: false });
  const { router } = jest.requireMock("expo-router") as { router: { push: jest.Mock } };
  router.push.mockClear();
  api.listNotifications.mockResolvedValue([{
    id: "ntf_refund",
    userId: "user_supplier",
    type: "refund_attempt",
    orderId: "ord_refunded",
    title: "Client refund",
    body: "A manual refund payment is reserved.",
    read: false,
    at: "2026-09-28T04:25:00.000Z",
  }]);
  api.listJobs.mockResolvedValue([]);

  await render(<AlertsScreen />);

  expect(await screen.findByText("Client refund update")).toBeTruthy();
  const body = screen.getByText("Operations is handling the client's side of the refund. Nothing changes for your shop.");
  expect(screen.queryByText(/reserved/)).toBeNull();
  fireEvent.press(body);
  await waitFor(() => expect(router.push).toHaveBeenCalled());
  expect(JSON.stringify(router.push.mock.calls[0][0])).toContain("ord_refunded");
});

describe("Alerts screen — app updates", () => {
  beforeEach(() => {
    api.listNotifications.mockReset();
    api.listJobs.mockReset();
    api.listNotifications.mockResolvedValue([offer]);
    api.listJobs.mockResolvedValue([]);
    useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, localOnly: false });
  });

  afterEach(() => {
    useAppUpdate.setState({ installed: null, latest: null, updatedNotice: null });
  });

  it("puts a newer version and its What's new above the job notices", async () => {
    useAppUpdate.setState({
      installed: { versionCode: 84, versionName: "1.0.84" },
      latest: {
        versionCode: 90,
        versionName: "1.0.90",
        publishedAt: null,
        apkBytes: null,
        whatsNew: ["A guided tour for new shops"],
      },
    });
    await render(<AlertsScreen />);

    expect(await screen.findByText("New job offered")).toBeTruthy();
    expect(screen.getByText("Version 1.0.90 is ready")).toBeTruthy();
    expect(screen.getByText("What's new in 1.0.90")).toBeTruthy();
    expect(screen.getByText("A guided tour for new shops")).toBeTruthy();
  });

  it("shows no update card on a phone that is current", async () => {
    await render(<AlertsScreen />);
    expect(await screen.findByText("New job offered")).toBeTruthy();
    expect(screen.queryByTestId("app-update-notices")).toBeNull();
  });
});

it("says a take-down is GRIDGO's, with the reason, and opens that listing", async () => {
  useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, localOnly: false });
  const { router } = jest.requireMock("expo-router") as { router: { push: jest.Mock } };
  router.push.mockClear();
  api.listNotifications.mockResolvedValue([{
    id: "ntf_takedown",
    userId: "user_supplier",
    type: "listing_suspended",
    catalogItemId: "sci_taken",
    title: "A listing was taken down",
    body: "The sample carries a shop logo",
    read: false,
    at: "2026-10-05T13:55:00.000Z",
  }]);
  api.listJobs.mockResolvedValue([]);

  await render(<AlertsScreen />);

  const title = await screen.findByText("Taken down by GRIDGO");
  expect(
    screen.getByText("Reason: The sample carries a shop logo. Only GRIDGO can put it back on the board."),
  ).toBeTruthy();
  fireEvent.press(title);
  await waitFor(() => expect(router.push).toHaveBeenCalledWith({
    pathname: "/shop/[id]",
    params: { id: "sci_taken" },
  }));
});

it("opens the board from a review decision that names no listing", async () => {
  useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, localOnly: false });
  const { router } = jest.requireMock("expo-router") as { router: { push: jest.Mock } };
  router.push.mockClear();
  api.listNotifications.mockResolvedValue([{
    id: "ntf_review",
    userId: "user_supplier",
    type: "catalog_review_decided",
    title: "Listing review updated",
    body: "Photo has a watermark",
    read: false,
    at: "2026-10-05T14:00:00.000Z",
  }]);
  api.listJobs.mockResolvedValue([]);

  await render(<AlertsScreen />);

  fireEvent.press(await screen.findByText("Operations asked for changes"));
  await waitFor(() => expect(router.push).toHaveBeenCalledWith("/(tabs)/catalogues"));
});
