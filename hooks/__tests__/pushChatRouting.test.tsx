import { act, renderHook } from "@testing-library/react-native";
import * as Notifications from "expo-notifications";

import { usePushNotifications } from "@/hooks/usePushNotifications";
import * as api from "@/lib/api";
import { useSession } from "@/store/session";

/**
 * gridgo-client#231 (shop half): a chat push opens its conversation.
 *
 * - `support_message` names no thread in its push, so the tap marks the
 *   notification read and opens the `threadId` that call returns — the exact
 *   thread, never the newest one.
 * - `pickup_chat_message` opens the pick-up chat of the job it names.
 * - One notification opens one screen, however the phone hands the tap over.
 */

let mockReady = true;
const mockPush = jest.fn();
const mockLast = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush }),
  useRootNavigationState: () => (mockReady ? { key: "root" } : undefined),
}));
jest.mock("expo-notifications", () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: () => mockLast(),
  clearLastNotificationResponseAsync: jest.fn(async () => {}),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  addPushTokenListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock("@/store/push", () => ({
  usePush: { getState: () => ({ registerIfGranted: jest.fn(), adoptToken: jest.fn() }) },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listNotifications: jest.fn(),
  getOrder: jest.fn(),
  readNotification: jest.fn(),
}));

const THREAD = "0b9a1f2c-3d4e-4f5a-8b6c-7d8e9f0a1b2c";
const approved = {
  id: "owner",
  role: "supplier" as const,
  name: "Owner",
  email: "owner@test",
  verificationStatus: "approved" as const,
};
const supportTap = (identifier: string) => ({
  notification: {
    request: {
      identifier,
      content: { data: { notificationId: "support-notice", type: "support_message", at: "2026-10-14T01:00:00.000Z" } },
    },
  },
});
const onTap = () =>
  (Notifications.addNotificationResponseReceivedListener as jest.Mock).mock.calls.at(-1)[0] as (
    response: unknown,
  ) => void;
const settle = () => act(async () => { jest.advanceTimersByTime(100); });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  mockReady = true;
  useSession.setState({ user: approved, loading: false, sessionWait: null });
  mockLast.mockResolvedValue(null);
  (api.listNotifications as jest.Mock).mockResolvedValue([]);
  (api.readNotification as jest.Mock).mockResolvedValue({
    id: "support-notice",
    type: "support_message",
    threadId: THREAD,
    read: true,
  });
});
afterEach(() => jest.useRealTimers());

it.each(["cold start", "background"])("opens the exact support thread on %s", async (mode) => {
  mockLast.mockResolvedValue(mode === "cold start" ? supportTap("cold") : null);
  await renderHook(() => usePushNotifications());
  if (mode === "background") await act(async () => { onTap()(supportTap("bg")); });
  await settle();
  expect(api.readNotification).toHaveBeenCalledWith("support-notice");
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith(`/chat/${THREAD}`);
});

it("opens a pending shop's support thread too — Operations chat is not behind approval", async () => {
  useSession.setState({ user: { ...approved, verificationStatus: "pending" as never } });
  mockLast.mockResolvedValue(supportTap("cold"));
  await renderHook(() => usePushNotifications());
  await settle();
  expect(mockPush).toHaveBeenCalledWith(`/chat/${THREAD}`);
});

it("reads the notification only once the shop is signed in and the navigator is ready", async () => {
  useSession.setState({ user: null });
  mockReady = false;
  mockLast.mockResolvedValue(supportTap("cold"));
  const view = await renderHook(() => usePushNotifications());
  await settle();
  expect(api.readNotification).not.toHaveBeenCalled();

  await act(async () => { useSession.setState({ user: approved }); });
  await settle();
  expect(api.readNotification).not.toHaveBeenCalled();

  mockReady = true;
  await view.rerender(undefined);
  await settle();
  expect(api.readNotification).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith(`/chat/${THREAD}`);
});

it("opens one screen for one notification, even reported under two native identifiers", async () => {
  mockLast.mockResolvedValue(supportTap("launch-id"));
  await renderHook(() => usePushNotifications());
  await act(async () => { onTap()(supportTap("tray-id")); });
  await settle();
  expect(api.readNotification).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledTimes(1);
});

it("lands a deleted support notification on chat history and spends the launch tap", async () => {
  (api.readNotification as jest.Mock).mockRejectedValue(
    new api.ApiError(404, { error: "notification_not_found" }),
  );
  mockLast.mockResolvedValue(supportTap("gone"));
  await renderHook(() => usePushNotifications());
  await settle();
  expect(mockPush).toHaveBeenCalledWith("/chat");
  expect(Notifications.clearLastNotificationResponseAsync).toHaveBeenCalled();
});

it("opens chat history when the notification names no thread", async () => {
  (api.readNotification as jest.Mock).mockResolvedValue({ id: "support-notice", type: "support_message", read: true });
  mockLast.mockResolvedValue(supportTap("old"));
  await renderHook(() => usePushNotifications());
  await settle();
  expect(mockPush).toHaveBeenCalledWith("/chat");
});

it("keeps an offline support tap until it can be read", async () => {
  (api.readNotification as jest.Mock).mockRejectedValueOnce(new Error("offline"));
  mockLast.mockResolvedValue(supportTap("offline"));
  await renderHook(() => usePushNotifications());
  await settle();
  expect(mockPush).not.toHaveBeenCalled();
});

it.each(["cold start", "background"])("opens the rider's pick-up chat for the owned job on %s", async (mode) => {
  const tap = {
    notification: {
      request: {
        identifier: `pickup-${mode}`,
        content: { data: { notificationId: "chat-notice", type: "pickup_chat_message", orderId: "job-1" } },
      },
    },
  };
  (api.listNotifications as jest.Mock).mockResolvedValue([
    { id: "chat-notice", orderId: "job-1", type: "pickup_chat_message" },
  ]);
  mockLast.mockResolvedValue(mode === "cold start" ? tap : null);
  await renderHook(() => usePushNotifications());
  if (mode === "background") await act(async () => { onTap()(tap); });
  await settle();
  expect(mockPush).toHaveBeenCalledTimes(1);
  expect(mockPush).toHaveBeenCalledWith("/job/job-1/messages");
});
