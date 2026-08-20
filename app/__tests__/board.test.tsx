import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  // The board reloads whenever it regains focus; on a bench there is one focus.
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
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
  getTaxonomy: jest.fn(async () => ({ categories: [], materials: [], finishes: [] })),
  listSupplierServices: jest.fn(async () => []),
  // The board reads the catalog projection, which is the one that carries the
  // formats and turnaround a listing inherits.
  listMyCatalogServices: jest.fn(async () => []),
  getDownloadUrl: jest.fn(async () => {
    throw new Error("no storage on the bench");
  }),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadBoard: jest.fn(),
  removeListing: jest.fn(),
}));

jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));

import BoardScreen from "@/app/(tabs)/catalogues";
import type { Listing } from "@/lib/listings";
import { loadBoard, removeListing } from "@/lib/listingsApi";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";

const approvedShop = {
  id: "u1",
  email: "shop@example.com",
  name: "Ben",
  role: "supplier" as const,
  supplierName: "PrintRight",
  verificationStatus: "approved" as const,
};

const listing: Listing = {
  id: "item_1",
  serviceLineId: "svc_1",
  subcategoryCode: "tarpaulins_outdoor_banners",
  name: "Tarpaulin, 13oz",
  description: "Printed on 13oz matte tarpaulin.",
  basePriceMinor: 45000,
  pricingUnit: "per_unit",
  packageQty: null,
  turnaroundMode: "override",
  turnaroundHours: 24,
  fileFormatMode: "override",
  formatCodes: ["pdf"],
  onTheBoard: true,
  sortOrder: 0,
  photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
  groups: [],
  version: 1,
  updatedAt: null,
};

describe("the shop's board", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (askConfirm as jest.Mock).mockResolvedValue(true);
    useSession.setState({
      user: approvedShop,
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
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

  it("invites a shop with nothing up to put something up", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [] });

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Nothing on the board yet")).toBeTruthy();
    expect(screen.getByText("Put something on the board")).toBeTruthy();
    await view.unmount();
  });

  /**
   * The listing routes are being built on GRIDGO in parallel with these
   * screens. A deployment without them must say so — never an empty board,
   * which would read as "you have no listings" to a shop that has several.
   */
  it("says plainly when GRIDGO has not opened the board yet", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "not_open_yet" });

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Your board is not open yet")).toBeTruthy();
    expect(screen.queryByText("Nothing on the board yet")).toBeNull();
    expect(screen.getByText("Check again")).toBeTruthy();
    await view.unmount();
  });

  it("shows each listing's name, price and wait", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [listing] });

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Tarpaulin, 13oz")).toBeTruthy();
    expect(screen.getByText("₱450.00 per piece")).toBeTruthy();
    expect(screen.getByText("Ready in 24 hours")).toBeTruthy();
    expect(screen.getByText("Add a listing")).toBeTruthy();
    await view.unmount();
  });

  /**
   * The captain's report: Remove this listing did nothing useful. It also sat
   * at the foot of a long form, under whatever the platform draws over the
   * bottom of the screen — so the wall offers it too, on the tile itself.
   */
  it("removes a listing from the wall, after asking", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [listing] });
    (removeListing as jest.Mock).mockResolvedValue({ status: "ok", value: "deleted" });

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    await fireEvent(
      screen.getByLabelText("Tarpaulin, 13oz. On the board."),
      "longPress",
    );

    await waitFor(() => expect(removeListing).toHaveBeenCalledWith(listing));
    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true, confirmLabel: "Remove it" }),
    );
    await view.unmount();
  });

  it("keeps a listing GRIDGO held for a job, and says why", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [listing] });
    (removeListing as jest.Mock).mockResolvedValue({ status: "ok", value: "archived" });

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    await fireEvent(
      screen.getByLabelText("Tarpaulin, 13oz. On the board."),
      "longPress",
    );

    expect(
      await screen.findByText(/Kept for a job already ordered/),
    ).toBeTruthy();
    await view.unmount();
  });

  it("leaves the listing alone when the shop says keep it", async () => {
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [listing] });
    (askConfirm as jest.Mock).mockResolvedValue(false);

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    await fireEvent(
      screen.getByLabelText("Tarpaulin, 13oz. On the board."),
      "longPress",
    );

    expect(removeListing).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("keeps a shop still with Operations working rather than shut out", async () => {
    useSession.setState({
      user: { ...approvedShop, verificationStatus: "pending" as const },
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
    (loadBoard as jest.Mock).mockResolvedValue({ status: "ok", value: [] });

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Operations is still reviewing your shop")).toBeTruthy();
    expect(await screen.findByText("Put something on the board")).toBeTruthy();
    await view.unmount();
  });
});
