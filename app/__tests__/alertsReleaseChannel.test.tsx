import { fireEvent, render, screen } from "@testing-library/react-native";
import AlertsScreen from "@/app/alerts";
import * as api from "@/lib/api";
import * as alertsApi from "@/lib/alertsApi";
import { installChannel } from "@/lib/buildDistribution";
import { useAlertsStore } from "@/store/alerts";

const mockNavigation = { setOptions: jest.fn() };
jest.mock("expo-router", () => ({
  router: { push: jest.fn() }, useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/components/PushEnableCard", () => ({ PushEnableCard: () => null }));
jest.mock("@/lib/buildDistribution", () => ({ ...jest.requireActual("@/lib/buildDistribution"), installChannel: jest.fn() }));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listNotifications: jest.fn(), listJobs: jest.fn(async () => []) }));
jest.mock("@/lib/alertsApi", () => ({ ...jest.requireActual("@/lib/alertsApi"), markAllRead: jest.fn(async () => ({ status: "saved" })) }));
jest.mock("@/components/AlertCard", () => ({
  AlertCard: ({ alert }: { alert: { title: string } }) => {
    const { Text } = jest.requireActual("react-native");
    return <Text>{alert.title}</Text>;
  },
}));

const row = (id: string, title: string, extra: Partial<api.Notification> = {}) =>
  ({ id, userId: "user_supplier", title, body: "", read: false, at: "2026-10-17T02:00:00.000Z", ...extra }) as api.Notification;

/** The captain's inbox, as GRIDGO serves it to an account with an iPhone and no APK. */
const inbox = [
  row("job", "New job: Flyers 101"),
  row("apk", "GRIDGO Supplier 1.0.251 is ready", { type: "announcement", releaseChannel: "apk", storeTarget: "apk_download" }),
  row("tf", "GRIDGO Supplier 1.0.5 is in TestFlight", { type: "announcement", releaseChannel: "ios", storeTarget: "testflight" }),
  row("legacy", "GRIDGO Supplier 1.0.182 is ready", { type: "announcement" }),
];

beforeEach(() => {
  useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, unreadIds: [] });
  (api.listNotifications as jest.Mock).mockResolvedValue(inbox);
});

it("lists, counts and marks read only this iPhone's release notices", async () => {
  (installChannel as jest.Mock).mockReturnValue("ios");
  const view = await render(<AlertsScreen />);

  await screen.findByText("GRIDGO Supplier 1.0.5 is in TestFlight");
  expect(screen.queryByText("GRIDGO Supplier 1.0.251 is ready")).toBeNull();
  expect(screen.queryByText("GRIDGO Supplier 1.0.182 is ready")).toBeNull();
  expect(useAlertsStore.getState().unreadCount).toBe(2);

  await fireEvent.press(screen.getByLabelText("Mark these 2 alerts read"));
  expect(alertsApi.markAllRead).toHaveBeenCalledWith(["job", "tf"]);
  // Hidden, not deleted: another install of this account still sees them.
  expect(useAlertsStore.getState().deleted).toEqual([]);
  await view.unmount();
});

it("lists an APK install's notices, the ones sent before channels included", async () => {
  (installChannel as jest.Mock).mockReturnValue("apk");
  const view = await render(<AlertsScreen />);

  await screen.findByText("GRIDGO Supplier 1.0.251 is ready");
  expect(screen.getByText("GRIDGO Supplier 1.0.182 is ready")).toBeTruthy();
  expect(screen.queryByText("GRIDGO Supplier 1.0.5 is in TestFlight")).toBeNull();
  expect(screen.getByLabelText("Mark these 3 alerts read")).toBeTruthy();
  expect(useAlertsStore.getState().unreadCount).toBe(3);
  await view.unmount();
});
