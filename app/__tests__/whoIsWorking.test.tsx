import { act, fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => callback(), [callback]);
  },
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => false) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getWorkingPicker: jest.fn(),
  selectWorker: jest.fn(),
  me: jest.fn(),
}));

import WhoIsWorkingScreen from "@/app/who-is-working";
import * as api from "@/lib/api";
import { useShopWorker } from "@/store/shopWorker";

const person = (id: string, name: string) => ({
  key: id, kind: "pin", name, role: "staff", status: "active", jobAlerts: true, photoFileId: null, onShift: false, createdAt: "",
});

async function typePin(digits: string) {
  for (const digit of digits) {
    await act(async () => {
      fireEvent.press(screen.getByLabelText(digit));
    });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  useShopWorker.setState({ shared: true, shopName: "Print Hub", worker: null, notice: null });
  (api.getWorkingPicker as jest.Mock).mockResolvedValue({ people: [person("shp_lito", "Lito"), person("shp_joy", "Joy")], worker: null });
});

describe("Who's working?", () => {
  it("lists the phone-free teammates and asks the picked one for their PIN", async () => {
    await render(<WhoIsWorkingScreen />);
    expect(await screen.findByText("Lito")).toBeTruthy();
    expect(screen.getByText("Shop phone for Print Hub")).toBeTruthy();
    expect(screen.getByText("Tap your face to start.")).toBeTruthy();
    await act(async () => {
      fireEvent.press(screen.getByRole("radio", { name: "Joy" }));
    });
    expect(screen.getByText("Joy, enter your PIN")).toBeTruthy();
  });

  it("clears a wrong PIN and says so, without repeating the digits", async () => {
    (api.selectWorker as jest.Mock).mockRejectedValue(new api.ApiError(403, { error: "shop_pin_invalid" }));
    await render(<WhoIsWorkingScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByRole("radio", { name: "Lito" }));
    });
    await typePin("1234");
    expect(api.selectWorker).toHaveBeenCalledWith("shp_lito", "1234");
    expect(screen.getByText("That PIN is not right. Try again.")).toBeTruthy();
    expect(screen.queryByText(/1234/)).toBeNull();
  });

  it("tells a blocked PIN to wait 15 minutes", async () => {
    (api.selectWorker as jest.Mock).mockRejectedValue(new api.ApiError(429, { error: "shop_pin_rate_limited" }));
    await render(<WhoIsWorkingScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByRole("radio", { name: "Lito" }));
    });
    await typePin("9999");
    expect(screen.getByText(/Wait 15 minutes, or ask the owner for a new PIN/)).toBeTruthy();
  });

  it("says why the picker came back after a turn ended", async () => {
    useShopWorker.setState({ notice: "timed_out" });
    await render(<WhoIsWorkingScreen />);
    expect(await screen.findByText(/Your turn ended/)).toBeTruthy();
  });

  it("drops a picked person GRIDGO no longer lists", async () => {
    (api.selectWorker as jest.Mock).mockRejectedValue(new api.ApiError(404, { error: "shop_member_not_found" }));
    await render(<WhoIsWorkingScreen />);
    await act(async () => {
      fireEvent.press(await screen.findByRole("radio", { name: "Lito" }));
    });
    (api.getWorkingPicker as jest.Mock).mockResolvedValue({ people: [person("shp_joy", "Joy")], worker: null });
    await typePin("1111");
    expect(screen.getByText(/no longer on the team/)).toBeTruthy();
    expect(screen.queryByText("Lito, enter your PIN")).toBeNull();
  });

  it("offers no way to the owner's screens but signing out", async () => {
    await render(<WhoIsWorkingScreen />);
    await screen.findByText("Lito");
    expect(screen.getByText("Sign out of this phone")).toBeTruthy();
    expect(screen.queryByText(/Money/)).toBeNull();
  });
});
