import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import ListingScreen from "@/app/shop/[id]/index";
import { router } from "expo-router";
import type { Listing } from "@/lib/listings";
import { loadListing, loadPrepSteps, saveListing } from "@/lib/listingsApi";
import { useSession } from "@/store/session";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  // The listing's own name goes in the platform's header, which has none here.
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "sci_1" }),
  // One focus on a bench, which is the mount.
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getTaxonomy: jest.fn(async () => ({ categories: [], materials: [], finishes: [] })),
  listMyCatalogServices: jest.fn(async () => []),
  getAcceptedFileFormats: jest.fn(async () => []),
  getDownloadUrl: jest.fn(async () => ({ url: "https://example.test/photo", expiresInSeconds: 300 })),
  getSettings: jest.fn(async () => ({ issueWindowHours: 48, deliveryFeeBands: [], colourDetection: { a3MonochromeMaxBps: 1200 } })),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadListing: jest.fn(),
  loadPrepSteps: jest.fn(async () => ({ status: "ok", value: [] })),
  saveListing: jest.fn(),
  setExpress: jest.fn(),
  addGroup: jest.fn(),
  addPrepStep: jest.fn(),
  reorderPrepSteps: jest.fn(),
  submitForReview: jest.fn(),
}));

function listingWith(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "sci_1",
    serviceLineId: "svc_1",
    subcategoryCode: "blueprint_cad",
    name: "Whiteprint",
    description: "",
    basePriceMinor: 0,
    pricingUnit: "per_page",
    packageQty: null,
    measureUnit: null,
    minimumWidthMilli: null,
    minimumHeightMilli: null,
    minimumLengthMilli: null,
    printerMaxWidthFeet: null,
    printLayouts: [],
    minimumOrderQuantity: null,
    priceTiers: [],
    speedTiers: [],
    turnaroundMode: "inherit",
    turnaround: null,
    fileFormatMode: "inherit",
    formatCodes: [],
    onTheBoard: false,
    sortOrder: 0,
    photos: [],
    groups: [],
    version: 7,
    updatedAt: null,
    pricedByColour: false,
    oneColour: false,
    colourPricing: null,
    colourSupported: true,
    ...overrides,
  };
}

/**
 * Issue report 0BE07331: construction and document shops price each sheet by
 * how much strong colour it has. The shop sets a price per sheet for each
 * colour tier and paper size; a blank tier is not offered, never filled in.
 */
describe("pricing a per-page listing by colour", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    (saveListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });
    (loadPrepSteps as jest.Mock).mockResolvedValue({ status: "ok", value: [] });
    useSession.setState({
      user: {
        id: "u1",
        email: "shop@example.com",
        name: "Ben",
        role: "supplier",
        supplierName: "PrintRight",
        verificationStatus: "approved",
      },
      loading: false,
      error: null,
      authSource: "clerk",
      identity: { kind: "supplier" },
    });
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
  });

  it("offers the choice only on a GRIDGO that has colour pricing", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith({ colourSupported: false }) });
    view = await render(<ListingScreen />);
    expect(await screen.findByLabelText("Your price")).toBeTruthy();
    expect(screen.queryByText("How each page is priced")).toBeNull();
  });

  it("marks a fixed-price listing as one colour", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({ basePriceMinor: 3000, printLayouts: ["fit_to_paper"] }),
    });
    view = await render(<ListingScreen />);

    expect(await screen.findByText("How each page is priced")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Prints in one colour"));
    await fireEvent.press(screen.getByLabelText("See what clients see"));

    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ pricedByColour: false, oneColour: true }),
      ),
    );
  });

  it("prices each tier per paper size, leaves a blank tier out, and follows the paper's tier set", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({
        printLayouts: ["fit_to_paper"],
        groups: [
          {
            id: "grp_size",
            name: "Sheet size",
            kind: "spec",
            required: true,
            helpText: null,
            sortOrder: 0,
            version: 1,
            options: [
              { id: "o1", label: "20x30", priceModifierMinor: 0, priceMultiplierBps: null, active: true, sortOrder: 0, paper: "20x30" },
              { id: "o2", label: "A3 sheet", priceModifierMinor: 0, priceMultiplierBps: null, active: true, sortOrder: 1, paper: "A3" },
            ],
          },
        ],
      }),
    });
    view = await render(<ListingScreen />);

    await fireEvent.press(await screen.findByLabelText("Priced by colour"));
    expect(screen.queryByLabelText("Your price")).toBeNull();

    // The listing's own size choices are one tap away.
    await fireEvent.press(screen.getByLabelText("Add 20x30"));
    expect(screen.getByText("20 × 30 in. Priced in the four large-format tiers.")).toBeTruthy();
    expect(screen.getByText("No strong colour")).toBeTruthy();
    expect(screen.getByText("Above 50%")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(/20x30, No strong colour/), "30");
    await fireEvent.changeText(screen.getByLabelText(/20x30, Up to 25%/), "60");
    await fireEvent.changeText(screen.getByLabelText(/20x30, Above 50%/), "200");

    // A3 takes its own two tiers, with the limit Super Admin set.
    await fireEvent.press(screen.getByLabelText("Add A3"));
    expect(screen.getByText("Up to 12%, monochrome")).toBeTruthy();
    expect(screen.getByText("Above 12%, full colour")).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText(/A3, Up to 12%, monochrome/), "10");
    expect(screen.queryByText(/Every page on that paper will need a price check/)).toBeNull();

    await fireEvent.press(screen.getByLabelText("See what clients see"));
    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          pricedByColour: true,
          oneColour: false,
          colourPricing: {
            sizes: [
              { paperSize: "20x30", tierSet: "large_format", prices: { none: 3000, up_to_25: 6000, above_50: 20000 } },
              { paperSize: "A3", tierSet: "a3", prices: { monochrome: 1000 } },
            ],
          },
        }),
      ),
    );
  });

  it("holds the save and asks for a print layout when the listing has none", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith({ printLayouts: [] }) });
    view = await render(<ListingScreen />);

    await fireEvent.press(await screen.findByLabelText("Priced by colour"));
    expect(screen.getByText(/Pricing by colour needs at least one print layout/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Add a paper size"));
    await fireEvent.changeText(screen.getByLabelText("Paper size"), "A2");
    await fireEvent.changeText(screen.getByLabelText(/A2, No strong colour/), "30");
    await fireEvent.press(screen.getByLabelText("See what clients see"));

    expect(saveListing).not.toHaveBeenCalled();
    // The picker sits right there; marking one lets it save.
    await fireEvent.press(screen.getAllByLabelText("Fit to paper")[0]);
    await fireEvent.press(screen.getByLabelText("See what clients see"));
    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ pricedByColour: true, printLayouts: ["fit_to_paper"] }),
      ),
    );
  });

  it("says a paper with every tier blank will need a price check", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({
        printLayouts: ["fit_to_paper"],
        pricedByColour: true,
        colourPricing: { sizes: [{ paperSize: "A1", tierSet: "large_format", prices: {} }] },
      }),
    });
    view = await render(<ListingScreen />);

    expect(
      await screen.findByText(
        "No tier is priced on A1. Every page on that paper will need a price check before the client can pay.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Priced by colour, no sheet prices yet")).toBeTruthy();
  });
});
