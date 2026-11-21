import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(() => {
      callback();
    }, [callback]);
  },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: { firstName: "Ben", lastName: "Santos", imageUrl: null } }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  me: jest.fn(),
  getSupplierProfile: jest.fn(),
  getShopStatus: jest.fn(),
  updateShopStatus: jest.fn(),
  getShopHours: jest.fn(),
  getShopTeam: jest.fn(),
  getMyReviews: jest.fn(),
  listCatalogItems: jest.fn(),
  getTaxonomy: jest.fn(),
  getSupplierReadiness: jest.fn(),
}));

jest.mock("@/hooks/useBoard", () => ({
  ...jest.requireActual("@/hooks/useBoard"),
  loadServiceLines: jest.fn(async () => []),
}));

jest.mock("@/store/sheets", () => ({
  ...jest.requireActual("@/store/sheets"),
  askConfirm: jest.fn(),
}));

import AccountScreen from "@/app/(tabs)/account";
import {
  getMyReviews,
  getShopHours,
  getShopStatus,
  getShopTeam,
  getSupplierProfile,
  getSupplierReadiness,
  getTaxonomy,
  listCatalogItems,
  me,
  updateShopStatus,
} from "@/lib/api";
import { router } from "expo-router";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";
import { useShopStatus } from "@/store/shopStatus";

const owner = {
  id: "u1",
  email: "owner@example.test",
  name: "Owner",
  role: "supplier" as const,
  supplierName: "Test shop",
  verificationStatus: "approved" as const,
};

function status(version: number, overrides: Record<string, unknown> = {}) {
  return {
    version,
    hours: { version, schedule: { week: [], closures: [] }, temporarilyClosed: false },
    todayHours: [{ opensMinute: 480, closesMinute: 1080 }],
    isOpenNow: true,
    nextOpeningAt: null,
    expressEnabled: true,
    nightJobs: "until_23",
    nightWindow: null,
    printerDemandPings: false,
    pausedUntil: null,
    ...overrides,
  };
}

describe("My shop hub", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    useShopStatus.getState().reset();
    (me as jest.Mock).mockResolvedValue(owner);
    (getSupplierProfile as jest.Mock).mockResolvedValue({ contactName: "Ben Santos" });
    (getShopStatus as jest.Mock).mockResolvedValue(status(2));
    (getShopHours as jest.Mock).mockResolvedValue({ hours: status(2).hours });
    (getShopTeam as jest.Mock).mockResolvedValue({ members: [] });
    (getMyReviews as jest.Mock).mockResolvedValue({ summary: null, ranking: null });
    (listCatalogItems as jest.Mock).mockResolvedValue({
      items: [
        { id: "item_1", version: 1, name: "A3 prints", basePriceMinor: 1000, active: false, photos: [] },
      ],
      nextCursor: null,
      total: 1,
    });
    (getTaxonomy as jest.Mock).mockRejectedValue(new Error("offline"));
    (getSupplierReadiness as jest.Mock).mockRejectedValue(new Error("offline"));
    useSession.setState({ user: owner, identity: { kind: "supplier" } });
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
    useSession.setState({ user: null });
  });

  it("hangs an OPEN sign with today's hours and the status chips", async () => {
    view = await render(<AccountScreen />);

    expect(await screen.findByText("OPEN")).toBeTruthy();
    expect(screen.getByText("8 AM – 6 PM")).toBeTruthy();
    expect(screen.getByText("Express on")).toBeTruthy();
    expect(screen.getByText("Night until 11 PM")).toBeTruthy();

    await fireEvent.press(screen.getByTestId("status-chips"));
    expect(router.push).toHaveBeenCalledWith("/shop-status");
  });

  it("asks before closing the shop, then closes it with an Undo", async () => {
    (askConfirm as jest.Mock).mockResolvedValue(true);
    (updateShopStatus as jest.Mock)
      .mockResolvedValueOnce(
        status(3, { isOpenNow: false, hours: { ...status(3).hours, temporarilyClosed: true } }),
      )
      .mockResolvedValueOnce(status(4));
    view = await render(<AccountScreen />);

    await fireEvent.press(await screen.findByTestId("shop-sign"));

    expect(askConfirm).toHaveBeenCalledWith(expect.objectContaining({ question: "Close your shop now?" }));
    expect(updateShopStatus).toHaveBeenCalledWith(2, { temporarilyClosed: true });
    expect(await screen.findByText("CLOSED")).toBeTruthy();
    expect(screen.getByText("Closed until you open it")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Undo, open the shop again"));
    expect(updateShopStatus).toHaveBeenLastCalledWith(3, { temporarilyClosed: false });
    expect(await screen.findByText("OPEN")).toBeTruthy();
  });

  it("keeps the shop open when the owner says stay open", async () => {
    (askConfirm as jest.Mock).mockResolvedValue(false);
    view = await render(<AccountScreen />);

    await fireEvent.press(await screen.findByTestId("shop-sign"));

    expect(updateShopStatus).not.toHaveBeenCalled();
  });

  it("lists products with their standing and opens one's quick actions", async () => {
    view = await render(<AccountScreen />);

    expect(await screen.findByText("A3 prints")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("product-tile-item_1"));
    expect(router.push).toHaveBeenCalledWith("/product-actions?id=item_1");
  });

  it("shows Staff the sign without letting them change it", async () => {
    useSession.setState({ user: { ...owner, shopRole: "staff" } as typeof owner });
    view = await render(<AccountScreen />);

    const sign = await screen.findByTestId("shop-sign");
    await fireEvent.press(sign);
    expect(askConfirm).not.toHaveBeenCalled();
    expect(screen.queryByLabelText("Edit your hours")).toBeNull();
    expect(screen.queryByText("A3 prints")).toBeNull();
  });
});
