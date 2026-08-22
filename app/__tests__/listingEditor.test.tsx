import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  // The listing's own name goes in the platform's header, which has none here.
  Stack: { Screen: () => null },
  useLocalSearchParams: () => ({ id: "sci_1" }),
  // One focus on a bench, which is the mount.
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
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
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadListing: jest.fn(),
  loadPrepSteps: jest.fn(async () => ({ status: "ok", value: [] })),
  saveListing: jest.fn(),
  addGroup: jest.fn(),
  addPrepStep: jest.fn(),
  reorderPrepSteps: jest.fn(),
}));

import ListingScreen from "@/app/shop/[id]/index";
import { router } from "expo-router";
import type { Listing } from "@/lib/listings";
import {
  addGroup,
  addPrepStep,
  loadListing,
  loadPrepSteps,
  reorderPrepSteps,
  saveListing,
} from "@/lib/listingsApi";
import { useSession } from "@/store/session";

function listingWith(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "sci_1",
    serviceLineId: "svc_1",
    subcategoryCode: "tarpaulins_outdoor_banners",
    name: "Tarpaulin, 13oz",
    description: "",
    basePriceMinor: 0,
    pricingUnit: "per_unit",
    packageQty: null,
    turnaroundMode: "inherit",
    turnaroundHours: null,
    fileFormatMode: "inherit",
    formatCodes: [],
    onTheBoard: false,
    sortOrder: 0,
    photos: [],
    groups: [],
    version: 7,
    updatedAt: null,
    ...overrides,
  };
}

describe("the listing editor", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    (saveListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });
    (loadPrepSteps as jest.Mock).mockResolvedValue({ status: "ok", value: [] });
    (addGroup as jest.Mock).mockResolvedValue({ status: "ok", value: null });
    (addPrepStep as jest.Mock).mockResolvedValue({ status: "ok", value: null });
    (reorderPrepSteps as jest.Mock).mockResolvedValue({ status: "ok", value: null });
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
    useSession.setState({
      user: null,
      loading: false,
      error: null,
      authSource: "none",
      identity: { kind: "signed_out" },
    });
  });

  /**
   * The captain's report: "GRIDGO did not return this listing" on a listing
   * GRIDGO answered 200 for.
   */
  it("opens a listing GRIDGO answered with, rather than saying it is unreachable", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("PRICE")).toBeTruthy();
    expect(screen.queryByText("This listing did not load")).toBeNull();
  });

  /**
   * The captain's report: samples were added and one empty frame was drawn.
   * All of them go in the strip — a shop that added six and saw four believed
   * two had not saved.
   */
  it("shows every sample, with the first one named as the board photo", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({
        photos: [
          { fileId: "file_1", sortOrder: 0, altText: null },
          { fileId: "file_2", sortOrder: 1, altText: null },
          { fileId: "file_3", sortOrder: 2, altText: null },
        ],
      }),
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("Board photo")).toBeTruthy();
    expect(screen.getByText("Sample 2")).toBeTruthy();
    expect(screen.getByText("Sample 3")).toBeTruthy();
    expect(screen.queryByText("No samples yet")).toBeNull();
  });

  /**
   * The captain's report: a price typed here and ₱0.00 on the preview.
   *
   * The preview reads GRIDGO's copy, so a price that never left the phone is
   * not on it. Every way out of this screen saves first.
   */
  it("saves a typed price before opening what clients see", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });

    view = await render(<ListingScreen />);

    await fireEvent.changeText(await screen.findByLabelText("Your price"), "450");
    await fireEvent.press(screen.getByLabelText("See what clients see"));

    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1", version: 7 }),
        expect.objectContaining({ basePriceMinor: 45000 }),
      ),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/shop/[id]/preview",
      params: { id: "sci_1" },
    });
  });

  /**
   * "Before they order" is a sequence, so it is numbered and it can be moved.
   * The first step cannot go earlier and the last cannot go later, and those
   * arrows are drawn dimmed rather than dropped so the row never reflows.
   */
  it("numbers the steps a client reads first, and lets them be moved", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });
    (loadPrepSteps as jest.Mock).mockResolvedValue({
      status: "ok",
      value: [
        { id: "cps_1", title: "Flatten your artwork", body: "", sortOrder: 0 },
        { id: "cps_2", title: "Outline your fonts", body: "", sortOrder: 1 },
      ],
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("Flatten your artwork")).toBeTruthy();
    expect(screen.getByText("Outline your fonts")).toBeTruthy();

    await fireEvent.press(
      screen.getByLabelText("Move step 2, Outline your fonts, earlier"),
    );

    await waitFor(() =>
      expect(reorderPrepSteps).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1" }),
        [
          expect.objectContaining({ id: "cps_2" }),
          expect.objectContaining({ id: "cps_1" }),
        ],
      ),
    );
  });

  /**
   * These routes are the newest thing on GRIDGO. A deployment without them
   * says so and offers to look again — it never grows a set of steps that
   * exist on one phone.
   */
  it("says plainly when GRIDGO has not opened the guide steps", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });
    (loadPrepSteps as jest.Mock).mockResolvedValue({ status: "not_open_yet" });

    view = await render(<ListingScreen />);

    expect(await screen.findByText(/GRIDGO has not opened this section yet/)).toBeTruthy();
    expect(screen.getByText("Check again")).toBeTruthy();
    expect(screen.queryByLabelText("Add a step to Before they order")).toBeNull();
  });

  /**
   * The captain's report: `POST .../option-groups 400 expected_version_required`.
   * The listing goes to the API layer whole, so its version travels with it.
   */
  it("opens an add-on against the listing GRIDGO answered with", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });

    view = await render(<ListingScreen />);

    await fireEvent.press(await screen.findByLabelText("Add an add-on"));
    await fireEvent.changeText(screen.getByLabelText("Add-on name"), "Rush");
    await fireEvent.changeText(screen.getByLabelText("First choice"), "Ready in 24 hours");
    await fireEvent.changeText(
      screen.getByLabelText("What this choice adds to the price"),
      "200",
    );
    await fireEvent.press(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(addGroup).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1", version: 7 }),
        expect.objectContaining({
          name: "Rush",
          kind: "addon",
          required: false,
          firstOption: { label: "Ready in 24 hours", priceModifierMinor: 20000 },
        }),
      ),
    );
  });

  it("lets a shop type AI and take a link instead of inventing a type", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({ fileFormatMode: "override", formatCodes: ["pdf"] }),
    });

    view = await render(<ListingScreen />);

    await fireEvent.press(await screen.findByLabelText("Another type"));
    await fireEvent.changeText(screen.getByLabelText("Type of file they send"), "AI");
    await fireEvent(screen.getByLabelText("Type of file they send"), "submitEditing");

    expect(await screen.findByText(/GRIDGO can't take that file yet/)).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Use Any other https link"));
    expect(screen.getByLabelText("Accept a Any other https link link on this listing")).toBeTruthy();
  });
});
