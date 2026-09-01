import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

const mockSetOptions = jest.fn();

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useNavigation: () => ({ setOptions: mockSetOptions }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
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

import AlertsScreen from "@/app/alerts";
import type { Notification } from "@/lib/api";
import { askConfirm } from "@/store/sheets";
import { useAlertsStore } from "@/store/alerts";

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
