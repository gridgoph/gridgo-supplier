import { act, renderHook, waitFor } from "@testing-library/react-native";

import { useListing } from "@/hooks/useBoard";
import { loadListing } from "@/lib/listingsApi";
import type { Listing } from "@/lib/listings";

/**
 * Expo Router runs a screen's focus effect every time it comes back into view.
 * On a bench there is one mount, so the callback is kept here and fired again
 * by hand — that second firing is exactly the moment being tested.
 */
const focusCallbacks: (() => void)[] = [];
jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(() => {
      focusCallbacks.push(callback);
      callback();
      return () => {
        const at = focusCallbacks.indexOf(callback);
        if (at >= 0) focusCallbacks.splice(at, 1);
      };
    }, [callback]);
  },
}));

jest.mock("@/lib/api", () => ({
  getTaxonomy: jest.fn(async () => ({ categories: [], materials: [], finishes: [] })),
  listMyCatalogServices: jest.fn(async () => []),
}));

jest.mock("@/lib/listingsApi", () => ({
  loadListing: jest.fn(),
  loadPrepSteps: jest.fn(async () => ({ status: "ok", value: [] })),
}));

function listingWith(photos: string[]): Listing {
  return {
    id: "sci_1",
    serviceLineId: "svc_1",
    subcategoryCode: "tarpaulins_outdoor_banners",
    name: "Tarpaulin, 13oz",
    description: "",
    basePriceMinor: 45000,
    pricingUnit: "per_unit",
    packageQty: null,
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    printerMaxWidthFeet: null,
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    turnaroundMode: "inherit",
    turnaroundHours: null,
    fileFormatMode: "inherit",
    formatCodes: [],
    onTheBoard: false,
    sortOrder: 0,
    photos: photos.map((fileId, sortOrder) => ({ fileId, sortOrder, altText: null })),
    groups: [],
    version: 7,
    updatedAt: null,
  };
}

/** Fire the focus effect again, the way returning to a screen does. */
async function refocus() {
  await act(async () => {
    for (const callback of [...focusCallbacks]) callback();
  });
}

/**
 * The captain's report: samples were added and the editor still showed none.
 *
 * The listing was loaded once, on mount, so coming back from the camera roll
 * redrew the same zero-photo listing this screen had been holding all along.
 * Focus is the moment it has to ask again — except while the shop is part-way
 * through typing, when asking again would take the words back off the screen.
 */
describe("one listing, while the shop is working on it", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    focusCallbacks.length = 0;
  });

  it("asks GRIDGO again when the editor comes back into view", async () => {
    (loadListing as jest.Mock)
      .mockResolvedValueOnce({ status: "ok", value: listingWith([]) })
      .mockResolvedValueOnce({ status: "ok", value: listingWith(["file_1", "file_2"]) });

    const { result } = await renderHook(() => useListing("sci_1"));

    await waitFor(() => expect(result.current.listing?.photos).toHaveLength(0));

    await refocus();

    await waitFor(() => expect(result.current.listing?.photos).toHaveLength(2));
  });

  it("holds the reload while there are words the shop has not saved", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith([]) });
    // Nothing is typed on the way in; the shop starts on the price after that.
    let typing = false;

    const { result } = await renderHook(() => useListing("sci_1", () => typing));

    await waitFor(() => expect(result.current.listing).not.toBeNull());
    expect(loadListing).toHaveBeenCalledTimes(1);

    typing = true;
    await refocus();

    expect(loadListing).toHaveBeenCalledTimes(1);

    // Saved, so the next look at the screen is free to take GRIDGO's copy.
    typing = false;
    await refocus();

    await waitFor(() => expect(loadListing).toHaveBeenCalledTimes(2));
  });

  it("spends no request until the router has handed over an id", async () => {
    await renderHook(() => useListing(null));

    await waitFor(() => expect(loadListing).not.toHaveBeenCalled());
  });
});

it("keeps the newest listing when an older read completes later", async () => {
  let receive!: (value: { status: "ok"; value: Listing }) => void;
  (loadListing as jest.Mock)
    .mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }))
    .mockResolvedValue({ status: "ok", value: { ...listingWith(["new"]), version: 9 } });
  const { result } = await renderHook(() => useListing("sci_1"));
  await act(async () => { await result.current.reload(); });
  expect(result.current.listing?.version).toBe(9);
  await act(async () => { receive({ status: "ok", value: listingWith([]) }); });
  expect(result.current.listing?.version).toBe(9);
  expect(result.current.listing?.photos).toHaveLength(1);
});
