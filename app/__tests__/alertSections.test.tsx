import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import AlertsScreen from "@/app/alerts";
import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";
import { useAlertsStore } from "@/store/alerts";

const mockMount = jest.fn();
const mockUnmount = jest.fn();
const mockNavigation = { setOptions: jest.fn() };
jest.mock("expo-router", () => ({
  router: { push: jest.fn() }, useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/components/PushEnableCard", () => ({ PushEnableCard: () => null }));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listNotifications: jest.fn(), listJobs: jest.fn(async () => []) }));
jest.mock("@/lib/alertsApi", () => ({ ...jest.requireActual("@/lib/alertsApi"), markRead: jest.fn(async () => ({ status: "saved" })) }));
jest.mock("@/components/AlertCard", () => ({
  AlertCard: ({ alert, unread, onMarkRead }: { alert: { id: string; title: string }; unread: boolean; onMarkRead: () => void }) => {
    const { useEffect } = jest.requireActual("react");
    const { Pressable, Text } = jest.requireActual("react-native");
    useEffect(() => { mockMount(alert.id); return () => mockUnmount(alert.id); }, [alert.id]);
    return <Pressable accessibilityLabel={alert.title} accessibilityState={{ selected: unread }} onPress={onMarkRead}><Text>{alert.title}</Text></Pressable>;
  },
}));

it("keeps a marked card mounted in its section through silent refresh", async () => {
  const first = { id: "first", title: "First alert", read: false } as api.Notification;
  const second = { id: "second", title: "Second alert", read: false } as api.Notification;
  useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0 });
  (api.listNotifications as jest.Mock).mockResolvedValue([first, second]);
  const view = await render(<AlertsScreen />);
  await fireEvent.press(await screen.findByLabelText("First alert"));
  await waitFor(() => expect(screen.getByLabelText("First alert").props.accessibilityState.selected).toBe(false));
  (api.listNotifications as jest.Mock).mockResolvedValue([{ ...first, read: true }, second, { id: "third", title: "Third alert", read: false }]);
  await act(async () => { invalidate("notifications"); });
  await screen.findByText("Third alert");
  expect(mockMount.mock.calls.filter(([id]) => id === "first")).toHaveLength(1);
  expect(mockUnmount).not.toHaveBeenCalled();
  expect(screen.queryByText("EARLIER")).toBeNull();
  await view.unmount();
});
