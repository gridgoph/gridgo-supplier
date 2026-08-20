import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@clerk/expo", () => ({
  useUser: () => ({ user: null }),
}));

jest.mock("react-native-safe-area-context", () => {
  const { View } = require("react-native");
  return {
    useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
    SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View>,
  };
});

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  listJobs: jest.fn(async () => []),
  listNotifications: jest.fn(async () => []),
  getDownloadUrl: jest.fn(async () => ({
    url: "https://example.test/sample.jpg",
    expiresInSeconds: 300,
  })),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadBoard: jest.fn(),
}));

jest.mock("@/hooks/useBoard", () => ({
  ...jest.requireActual("@/hooks/useBoard"),
  loadServiceLines: jest.fn(async () => []),
}));

import HomeScreen from "@/app/(tabs)/home";
import { router } from "expo-router";
import type { User } from "@/lib/api";
import type { Listing } from "@/lib/listings";
import { loadBoard } from "@/lib/listingsApi";
import { useSession } from "@/store/session";

const pendingShop: User = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier",
  supplierName: "PrintRight",
  verificationStatus: "pending",
};

const approvedShop: User = { ...pendingShop, verificationStatus: "approved" };

function listing(id: string, photos: string[]): Listing {
  return {
    id,
    serviceLineId: "svc_1",
    subcategoryCode: "tarpaulins_outdoor_banners",
    name: `Listing ${id}`,
    description: "",
    basePriceMinor: 45000,
    pricingUnit: "per_unit",
    packageQty: null,
    turnaroundMode: "override",
    turnaroundHours: 24,
    fileFormatMode: "override",
    formatCodes: ["pdf"],
    onTheBoard: true,
    sortOrder: 0,
    photos: photos.map((fileId, sortOrder) => ({ fileId, sortOrder, altText: null })),
    groups: [],
    version: 1,
    updatedAt: null,
  };
}

function signIn(user: User) {
  useSession.setState({
    user,
    loading: false,
    error: null,
    authSource: "clerk",
    identity: { kind: "supplier" },
  });
}

describe("Home for a shop waiting on Operations", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadBoard as jest.Mock).mockResolvedValue({ status: "not_open_yet" });
  });

  afterEach(() => {
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
  });

  it("tells the truth about the wait instead of a quiet floor", async () => {
    signIn(pendingShop);

    const view = await render(<HomeScreen />);

    expect(screen.getByText("Operations is reviewing your shop")).toBeTruthy();
    expect(screen.getByText("The floor stays empty until they approve.")).toBeTruthy();
    expect(screen.queryByText("Nothing owed today")).toBeNull();
    expect(screen.queryByText(/nothing needs you/i)).toBeNull();
    expect(screen.getByText("Open accreditation")).toBeTruthy();
    await view.unmount();
  });

  /**
   * Operations wants a finished listing before they accredit, so the shop that
   * is waiting is the one with the most reason to open its board.
   */
  it("still hands a waiting shop the way into its board", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [listing("a", ["f1"])] });
    signIn(pendingShop);

    const view = await render(<HomeScreen />);

    expect(await screen.findByLabelText("Open your board. 1 listing.")).toBeTruthy();
    await view.unmount();
  });
});

/**
 * The captain's screenshot: a "Nothing due today" chip in the top right, with
 * an arrow drawn from it down to the Alerts tab. That corner reads as a bell
 * wherever it appears, and alerts already have a tab with a badge on it — so
 * the corner is given to the board instead, and nothing in this masthead
 * counts, warns or announces anything.
 */
describe("the corner of Home's masthead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadBoard as jest.Mock).mockResolvedValue({
      status: "ok",
      value: [listing("a", ["f1"]), listing("b", ["f2"]), listing("c", [])],
    });
    signIn(approvedShop);
  });

  afterEach(() => {
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
  });

  it("carries the shop's board, counted for anyone who cannot see it", async () => {
    const view = await render(<HomeScreen />);

    expect(await screen.findByLabelText("Open your board. 3 listings.")).toBeTruthy();
    await view.unmount();
  });

  it("opens the board", async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(await screen.findByLabelText("Open your board. 3 listings."));

    expect(router.push).toHaveBeenCalledWith("/shop");
    await view.unmount();
  });

  /** Due and late are said on the obligations below, and again on Schedule. */
  it("counts nothing due, late or unread up here", async () => {
    const view = await render(<HomeScreen />);

    await screen.findByLabelText("Open your board. 3 listings.");
    expect(screen.queryByText("Nothing due today")).toBeNull();
    expect(screen.queryByText(/due today$/)).toBeNull();
    expect(screen.queryByText(/\d+ late/)).toBeNull();
    expect(screen.queryByText(/unread/i)).toBeNull();
    await view.unmount();
  });

  /** A board with nothing on it is still a door, and still says how many. */
  it("keeps the door open on a board with no samples yet", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [] });

    const view = await render(<HomeScreen />);

    expect(await screen.findByLabelText("Open your board. No listings yet.")).toBeTruthy();
    await view.unmount();
  });

  /** A door to a room this deployment does not have is worse than no door. */
  it("draws nothing while GRIDGO has not opened the board", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "not_open_yet" });

    const view = await render(<HomeScreen />);

    await screen.findByText("PrintRight");
    expect(screen.queryByLabelText(/Open your board/)).toBeNull();
    await view.unmount();
  });
});
