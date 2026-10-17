import { act, render, screen, waitFor } from "@testing-library/react-native";
import AlertsScreen from "@/app/alerts";
import * as api from "@/lib/api";
import { useAlertsStore } from "@/store/alerts";

/*
  The Alerts screen is pushed, so every visit mounts it afresh. These pin the
  three things that made it sit on "Loading your alerts": no cached first
  paint, the list waiting on the job list, and every card drawn in one go.
*/

const mockMount = jest.fn();
jest.mock("expo-router", () => ({
  router: { push: jest.fn() }, useNavigation: () => ({ setOptions: jest.fn() }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/components/PushEnableCard", () => ({ PushEnableCard: () => null }));
jest.mock("@/lib/api", () => ({ ...jest.requireActual("@/lib/api"), listNotifications: jest.fn(), listJobs: jest.fn() }));
jest.mock("@/components/AlertCard", () => ({
  AlertCard: ({ alert, stageIndex }: { alert: { id: string; title: string }; stageIndex: number }) => {
    const { useEffect } = jest.requireActual("react");
    const { Text } = jest.requireActual("react-native");
    useEffect(() => { mockMount(alert.id); }, [alert.id]);
    return <Text>{`${alert.title}${stageIndex >= 0 ? " · on a stage" : ""}`}</Text>;
  },
}));

const listNotifications = api.listNotifications as jest.Mock;
const listJobs = api.listJobs as jest.Mock;

function alert(id: string, extra: Partial<api.Notification> = {}): api.Notification {
  return { id, userId: "user_supplier", title: `Alert ${id}`, body: "Body", read: false, at: "2026-10-01T00:00:00Z", ...extra };
}

/** A request that answers only when the test says so. */
function held<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

beforeEach(() => {
  mockMount.mockClear();
  listNotifications.mockReset();
  listJobs.mockReset();
  useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, localOnly: false, inbox: null, inboxJobs: null });
});

it("opens on the inbox it last read, with no skeleton, and refreshes underneath", async () => {
  useAlertsStore.setState({ inbox: [alert("a", { title: "Cached alert" })] });
  const fresh = held<api.Notification[]>();
  listNotifications.mockReturnValue(fresh.promise);
  listJobs.mockResolvedValue([]);

  await render(<AlertsScreen />);

  expect(screen.getByText("Cached alert")).toBeTruthy();
  expect(screen.queryByLabelText("Loading your alerts")).toBeNull();
  expect(listNotifications).toHaveBeenCalledTimes(1);

  await act(async () => { fresh.resolve([alert("b", { title: "Fresh alert" }), alert("a", { title: "Cached alert" })]); });
  expect(await screen.findByText("Fresh alert")).toBeTruthy();
  expect(useAlertsStore.getState().inbox?.map((item) => item.id)).toEqual(["b", "a"]);
});

it("still shows the skeleton to a shop whose inbox has never been read", async () => {
  listNotifications.mockReturnValue(new Promise(() => {}));
  listJobs.mockResolvedValue([]);

  await render(<AlertsScreen />);

  expect(screen.getByLabelText("Loading your alerts")).toBeTruthy();
});

it("draws the alerts without waiting for the job list, and places them on a stage when it lands", async () => {
  listNotifications.mockResolvedValue([alert("a", { title: "Proof needed", orderId: "ord_1" })]);
  const jobs = held<api.Order[]>();
  listJobs.mockReturnValue(jobs.promise);

  await render(<AlertsScreen />);

  expect(await screen.findByText("Proof needed")).toBeTruthy();
  await act(async () => { jobs.resolve([{ id: "ord_1", state: "production" } as api.Order]); });
  expect(await screen.findByText("Proof needed · on a stage")).toBeTruthy();
  expect(useAlertsStore.getState().inboxJobs?.map((job) => job.id)).toEqual(["ord_1"]);
});

it("keeps the inbox when the job list fails", async () => {
  listNotifications.mockResolvedValue([alert("a", { title: "Still here" })]);
  listJobs.mockRejectedValue(new Error("offline"));

  await render(<AlertsScreen />);

  expect(await screen.findByText("Still here")).toBeTruthy();
  expect(screen.queryByText("Alerts are not reachable")).toBeNull();
});

it("draws a screenful of a long inbox on arrival rather than every card at once", async () => {
  const many = Array.from({ length: 120 }, (_, index) => alert(`n${index}`));
  listNotifications.mockResolvedValue(many);
  listJobs.mockResolvedValue([]);

  await render(<AlertsScreen />);

  expect(await screen.findByText("Alert n0")).toBeTruthy();
  await waitFor(() => expect(mockMount).toHaveBeenCalled());
  expect(mockMount.mock.calls.length).toBeLessThan(20);
  expect(screen.getByText("NEW")).toBeTruthy();
});
