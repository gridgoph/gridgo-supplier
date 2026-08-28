import AsyncStorage from "@react-native-async-storage/async-storage";
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
  loadBoardKinds: jest.fn(),
  removeListing: jest.fn(),
}));

jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(async () => true),
  askPick: jest.fn(async () => null),
}));

import BoardScreen from "@/app/(tabs)/catalogues";
import type { CatalogListQuery } from "@/lib/api";
import type { Listing } from "@/lib/listings";
import { loadBoard, loadBoardKinds, removeListing } from "@/lib/listingsApi";
import { askConfirm, askPick } from "@/store/sheets";
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

/** One page of the board, the shape GRIDGO answers `/me/catalog-items` with. */
function page(listings: Listing[], nextCursor: string | null = null, total = listings.length) {
  return { status: "ok" as const, value: { listings, nextCursor, total } };
}

/** What the wall last asked GRIDGO for. */
function lastAsk(): CatalogListQuery {
  const calls = (loadBoard as jest.Mock).mock.calls;
  return calls[calls.length - 1][0] as CatalogListQuery;
}

/** The hunt field, by the name a screen reader hears. */
function huntField() {
  return screen.getByLabelText("Find a sample on your board");
}

/** Type and press the keyboard's own search key, which skips the 250ms wait. */
async function hunt(text: string) {
  await fireEvent.changeText(huntField(), text);
  await fireEvent(huntField(), "submitEditing");
}

describe("the shop's board", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (askConfirm as jest.Mock).mockResolvedValue(true);
    (loadBoardKinds as jest.Mock).mockResolvedValue([listing]);
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
    (loadBoardKinds as jest.Mock).mockResolvedValue([]);
    (loadBoard as jest.Mock).mockResolvedValue(page([]));

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Nothing on the board yet")).toBeTruthy();
    expect(screen.getByText("Put something on the board")).toBeTruthy();
    // Nothing to hunt through, so nothing to hunt with.
    expect(screen.queryByLabelText("Find a sample on your board")).toBeNull();
    await view.unmount();
  });

  /**
   * The listing routes are being built on GRIDGO in parallel with these
   * screens. A deployment without them must say so — never an empty board,
   * which would read as "you have no listings" to a shop that has several.
   */
  it("says plainly when GRIDGO has not opened the board yet", async () => {
    (loadBoardKinds as jest.Mock).mockResolvedValue([]);
    (loadBoard as jest.Mock).mockResolvedValue({ status: "not_open_yet" });

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Your board is not open yet")).toBeTruthy();
    expect(screen.queryByText("Nothing on the board yet")).toBeNull();
    expect(screen.getByText("Check again")).toBeTruthy();
    await view.unmount();
  });

  it("shows each listing's name and price on the wall, and adds from the plus", async () => {
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Tarpaulin, 13oz")).toBeTruthy();
    expect(screen.getByText("₱450.00 per piece")).toBeTruthy();
    expect(screen.queryByText("Ready in 24 hours")).toBeNull();
    expect(screen.queryByText(/still needs something/)).toBeNull();
    expect(screen.getByLabelText("Add a listing")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Put something on the board" })).toBeNull();
    await view.unmount();
  });

  /**
   * The resting board is the shop's whole board. A default that quietly sent
   * `active=true` would hide every draft a shop has not put up yet.
   */
  it("asks GRIDGO for the whole board when nothing is narrowing it", async () => {
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    expect(lastAsk()).toEqual({
      q: null,
      sort: "board",
      subcategoryCode: null,
      active: null,
      limit: 8,
      cursor: null,
    });
    await view.unmount();
  });

  it("flips to a list of quotes with the wait, the peso, and how it is sold", async () => {
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    await fireEvent.press(screen.getByLabelText("Show as a list"));

    expect(screen.getByText("Ready in 24 hours")).toBeTruthy();
    expect(screen.getByText("₱450.00")).toBeTruthy();
    expect(screen.getByText("per piece")).toBeTruthy();
    expect(String(screen.getByText("₱450.00").props.className ?? "")).toContain("text-body");
    expect(String(screen.getByText("₱450.00").props.className ?? "")).not.toContain("text-h3");
    await view.unmount();
  });

  it("filters by kind of work from the select", async () => {
    const flyers: Listing = {
      ...listing,
      id: "item_2",
      name: "Flyers 101",
      subcategoryCode: "flyers",
      onTheBoard: true,
    };
    (loadBoardKinds as jest.Mock).mockResolvedValue([listing, flyers]);
    (loadBoard as jest.Mock).mockResolvedValue(page([listing, flyers]));
    (askPick as jest.Mock).mockResolvedValueOnce("flyers");

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Tarpaulin, 13oz")).toBeTruthy();
    (loadBoard as jest.Mock).mockResolvedValue(page([flyers]));
    await fireEvent.press(await screen.findByLabelText("Kind of work, All work"));
    await waitFor(() => expect(lastAsk().subcategoryCode).toBe("flyers"));
    await waitFor(() => expect(screen.queryByText("Tarpaulin, 13oz")).toBeNull());
    expect(screen.getByText("Flyers 101")).toBeTruthy();
    await view.unmount();
  });

  it("toggles to listings that are on the board", async () => {
    const hidden: Listing = { ...listing, id: "item_h", name: "Hidden cards", onTheBoard: false };
    (loadBoard as jest.Mock).mockResolvedValue(page([listing, hidden]));

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Tarpaulin, 13oz")).toBeTruthy();
    expect(screen.getByText("Hidden cards")).toBeTruthy();
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));
    await fireEvent.press(screen.getByRole("radio", { name: "On the board" }));
    await waitFor(() => expect(lastAsk().active).toBe(true));
    await waitFor(() => expect(screen.queryByText("Hidden cards")).toBeNull());
    expect(screen.getByText("Tarpaulin, 13oz")).toBeTruthy();
    await view.unmount();
  });

  it("hands the sort to GRIDGO rather than reordering the page here", async () => {
    const zebra: Listing = { ...listing, id: "item_z", name: "Zebra tarp", sortOrder: 0 };
    const alpha: Listing = { ...listing, id: "item_a", name: "Alpha tarp", sortOrder: 1 };
    (loadBoard as jest.Mock).mockResolvedValue(page([zebra, alpha]));
    (askPick as jest.Mock).mockResolvedValueOnce("name");

    const view = await render(<BoardScreen />);

    await screen.findByText("Zebra tarp");
    (loadBoard as jest.Mock).mockResolvedValue(page([alpha, zebra]));
    await fireEvent.press(screen.getByLabelText("Sort: Default"));
    await waitFor(() => expect(lastAsk().sort).toBe("name"));
    await waitFor(() => {
      const names = screen.getAllByText(/tarp/).map((node) => node.props.children);
      expect(names[0]).toBe("Alpha tarp");
      expect(names[1]).toBe("Zebra tarp");
    });
    await view.unmount();
  });

  it("pages forward on GRIDGO's cursor and back on the one it kept", async () => {
    const first = Array.from({ length: 8 }, (_, i) => ({
      ...listing,
      id: `item_${i}`,
      name: `Listing ${i}`,
      sortOrder: i,
    }));
    const second = [{ ...listing, id: "item_8", name: "Listing 8", sortOrder: 8 }];
    (loadBoardKinds as jest.Mock).mockResolvedValue(first);
    (loadBoard as jest.Mock).mockResolvedValue(page(first, "cur_2", 9));

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Listing 0")).toBeTruthy();
    expect(screen.queryByText("Listing 8")).toBeNull();
    expect(screen.getByText("1–8 of 9")).toBeTruthy();

    (loadBoard as jest.Mock).mockResolvedValue(page(second, null, 9));
    await fireEvent.press(screen.getByLabelText("Next page"));

    expect(await screen.findByText("Listing 8")).toBeTruthy();
    expect(lastAsk().cursor).toBe("cur_2");
    expect(screen.queryByText("Listing 0")).toBeNull();
    expect(screen.getByText("9–9 of 9")).toBeTruthy();

    (loadBoard as jest.Mock).mockResolvedValue(page(first, "cur_2", 9));
    await fireEvent.press(screen.getByLabelText("Previous page"));

    expect(await screen.findByText("Listing 0")).toBeTruthy();
    expect(lastAsk().cursor).toBeNull();
    await view.unmount();
  });

  /**
   * The captain's report: Remove this listing did nothing useful. It also sat
   * at the foot of a long form, under whatever the platform draws over the
   * bottom of the screen — so the wall offers it too, on the tile itself.
   */
  it("removes a listing from the wall, after asking", async () => {
    (loadBoard as jest.Mock)
      .mockResolvedValueOnce(page([listing]))
      .mockResolvedValue(page([]));
    (removeListing as jest.Mock).mockResolvedValue({ status: "ok", value: "deleted" });

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    await fireEvent(
      screen.getByLabelText(/Tarpaulin, 13oz\..*On the board/),
      "longPress",
    );

    await waitFor(() => expect(removeListing).toHaveBeenCalledWith(listing));
    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({ destructive: true, confirmLabel: "Remove it" }),
    );
    await waitFor(() => expect(screen.queryByText("Tarpaulin, 13oz")).toBeNull());
    await view.unmount();
  });

  it("keeps a listing GRIDGO held for a job, and says why", async () => {
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));
    (removeListing as jest.Mock).mockResolvedValue({ status: "ok", value: "archived" });

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    await fireEvent(
      screen.getByLabelText(/Tarpaulin, 13oz\..*On the board/),
      "longPress",
    );

    expect(
      await screen.findByText(/Kept for a job already ordered/),
    ).toBeTruthy();
    await view.unmount();
  });

  it("leaves the listing alone when the shop says keep it", async () => {
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));
    (askConfirm as jest.Mock).mockResolvedValue(false);

    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    await fireEvent(
      screen.getByLabelText(/Tarpaulin, 13oz\..*On the board/),
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
    (loadBoardKinds as jest.Mock).mockResolvedValue([]);
    (loadBoard as jest.Mock).mockResolvedValue(page([]));

    const view = await render(<BoardScreen />);

    expect(await screen.findByText("Operations is still reviewing your shop")).toBeTruthy();
    expect(await screen.findByText("Put something on the board")).toBeTruthy();
    await view.unmount();
  });
});

/**
 * Find a sample.
 *
 * The wall is where a shop looks for its own work, so the hunt has to leave the
 * wall where it is — and it has to be GRIDGO's hunt, because a shop with two
 * hundred samples cannot download two hundred samples to find one.
 */
describe("hunting the board", () => {
  const flyers: Listing = {
    ...listing,
    id: "item_2",
    name: "Flyers 101",
    subcategoryCode: "flyers",
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    (askConfirm as jest.Mock).mockResolvedValue(true);
    (loadBoardKinds as jest.Mock).mockResolvedValue([listing, flyers]);
    (loadBoard as jest.Mock).mockResolvedValue(page([listing, flyers]));
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

  it("asks in the shop's own words and puts the answer on the same wall", async () => {
    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));
    await hunt("tarp");

    await waitFor(() => expect(lastAsk().q).toBe("tarp"));
    await waitFor(() => expect(screen.queryByText("Flyers 101")).toBeNull());
    // The wall is still the wall — no scene of its own to come back from.
    expect(screen.getByLabelText("Add a listing")).toBeTruthy();
    await view.unmount();
  });

  /**
   * A hunt that found nothing is not an empty board, and the two must never
   * wear the same words: one says clear the hunt, the other says your shop has
   * no samples up.
   */
  it("tells an empty hunt apart from an empty board, and offers the way back", async () => {
    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    (loadBoard as jest.Mock).mockResolvedValue(page([]));
    await hunt("linen");

    expect(
      await screen.findByText(
        "Nothing on your board matches that. Clear the hunt, or put a new sample up.",
      ),
    ).toBeTruthy();
    expect(screen.queryByText("Nothing on the board yet")).toBeNull();

    (loadBoard as jest.Mock).mockResolvedValue(page([listing, flyers]));
    await fireEvent.press(screen.getByText("Clear the hunt"));

    await waitFor(() => expect(lastAsk().q).toBeNull());
    expect(await screen.findByText("Tarpaulin, 13oz")).toBeTruthy();
    await view.unmount();
  });

  /**
   * The signature: the shop is hunting, so the wall is the answer. Kind,
   * standing and sort fold into one chip that keeps the count of how many are
   * still narrowing — the only thing that explains a hunt finding nothing while
   * Hidden is selected. The count and the wall/list toggle never fold.
   */
  it("folds the standing filters into one chip while the shop is hunting", async () => {
    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    expect(screen.getByLabelText("Sort: Default")).toBeTruthy();

    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));
    await fireEvent.press(screen.getByRole("radio", { name: "Hidden" }));
    await waitFor(() => expect(lastAsk().active).toBe(false));
    await hunt("tarp");

    const filters = await screen.findByLabelText("Filters, 1 narrowing your board");
    expect(screen.queryByLabelText("Sort: Default")).toBeNull();
    expect(screen.getByLabelText("Show as a list")).toBeTruthy();

    await fireEvent.press(filters);
    expect(await screen.findByLabelText("Sort: Default")).toBeTruthy();
    await view.unmount();
  });

  /** The mark is weight, in the name only — never a colour a status owns. */
  it("marks the run the hunt matched in the listing's name", async () => {
    const view = await render(<BoardScreen />);

    await screen.findByText("Tarpaulin, 13oz");
    (loadBoard as jest.Mock).mockResolvedValue(page([listing]));
    await hunt("tarp");

    const marked = await screen.findByText("Tarp");
    expect(String(marked.props.className ?? "")).toContain("font-bold");
    expect(String(marked.props.className ?? "")).not.toContain("action-yellow");
    // Only the run is marked; the rest of the name is the same text it was.
    expect(screen.getByText("Tarpaulin, 13oz")).toBeTruthy();
    await view.unmount();
  });
});
