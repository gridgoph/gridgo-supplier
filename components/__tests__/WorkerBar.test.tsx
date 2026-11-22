import { act, fireEvent, render, screen } from "@testing-library/react-native";

let mockSegments: string[] = ["job", "[id]"];
jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 24, left: 0, right: 0 }),
}));

import { PushedWorkerBar, WorkerBar } from "@/components/team/WorkerBar";
import { useSession } from "@/store/session";
import { useShopWorker } from "@/store/shopWorker";

const worker = { pinStaffId: "shp_joy", name: "Test Joy" };

beforeEach(() => {
  mockSegments = ["job", "[id]"];
  useSession.setState({
    user: { id: "sup_1", email: "", name: "Test Joy", role: "supplier", shopRole: "staff", worker },
    identity: { kind: "supplier" },
  });
});

describe("who the shop phone is acting as", () => {
  it("names the worker over a pushed screen such as a job", async () => {
    await render(<PushedWorkerBar />);
    expect(screen.getByText("Test Joy is working")).toBeTruthy();
  });

  it("leaves the tabs to their own bar above the tab bar", async () => {
    mockSegments = ["(tabs)", "home"];
    await render(<PushedWorkerBar />);
    expect(screen.queryByText("Test Joy is working")).toBeNull();
  });

  it("draws nothing for a person on their own login", async () => {
    useSession.setState({ user: { id: "u1", email: "", name: "Owner", role: "supplier" } });
    await render(<PushedWorkerBar />);
    expect(screen.queryByTestId("worker-bar")).toBeNull();
  });

  it("hands the phone back on Switch", async () => {
    const lock = jest.fn(async () => undefined);
    useShopWorker.setState({ lock });
    await render(<WorkerBar />);
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Switch person"));
    });
    expect(lock).toHaveBeenCalled();
  });
});
