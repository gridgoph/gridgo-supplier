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
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
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

  /** The inbox is where the approval arrives, so it is reachable while waiting. */
  it("still hands a waiting shop its alerts", async () => {
    signIn(pendingShop);

    const view = await render(<HomeScreen />);

    expect(screen.getByLabelText("Alerts")).toBeTruthy();
    await view.unmount();
  });
});

/**
 * Two corrections meet in this corner.
 *
 * A pill counting today's jobs sat here and read as an inbox. Replacing it with
 * a picture of the shop's board fixed the wrong half — it moved the shortcut
 * into the corner and left the inbox in the tab bar. The captain wants the
 * ordinary shape: a bell you glance at while you work, and a bar spent on the
 * five places a shop stands.
 */
describe("the corner of Home's masthead", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (loadBoard as jest.Mock).mockResolvedValue({
      status: "ok",
      value: {
        listings: [listing("a", ["f1"]), listing("b", ["f2"]), listing("c", [])],
        nextCursor: null,
        total: 3,
      },
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

  it("carries the alerts inbox", async () => {
    const view = await render(<HomeScreen />);

    await fireEvent.press(screen.getByLabelText("Alerts"));

    expect(router.push).toHaveBeenCalledWith("/alerts");
    await view.unmount();
  });

  /** Due and late are said on the obligations below, and again on Schedule. */
  it("counts no jobs up here", async () => {
    const view = await render(<HomeScreen />);

    await screen.findByLabelText("Alerts");
    expect(screen.queryByText("Nothing due today")).toBeNull();
    expect(screen.queryByText(/due today$/)).toBeNull();
    expect(screen.queryByText(/\d+ late/)).toBeNull();
    await view.unmount();
  });

  /** The board is a tab now; the card at the foot opens it, not a corner. */
  it("sends the board card to the Catalogues tab", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({
      status: "ok",
      value: { listings: [], nextCursor: null, total: 0 },
    });

    const view = await render(<HomeScreen />);

    await fireEvent.press(await screen.findByText("Put something on the board"));

    expect(router.push).toHaveBeenCalledWith("/(tabs)/catalogues");
    await view.unmount();
  });
});
