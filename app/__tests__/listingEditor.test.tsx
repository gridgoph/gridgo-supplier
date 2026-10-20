import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react-native";

import ListingScreen from "@/app/shop/[id]/index";
import { router } from "expo-router";
import type { Listing } from "@/lib/listings";
import {
  addGroup,
  addPrepStep,
  loadListing,
  loadPrepSteps,
  reorderPrepSteps,
  applyProductionTimeToAll,
  loadProductionTimePreview,
  saveListing,
  submitForReview,
} from "@/lib/listingsApi";
import { useSession } from "@/store/session";
import { usePhotoPolicy } from "@/store/photoPolicy";
import { settleConfirm, settlePhotoPolicy, useSheets } from "@/store/sheets";

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
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadListing: jest.fn(),
  loadPrepSteps: jest.fn(async () => ({ status: "ok", value: [] })),
  saveListing: jest.fn(),
  loadProductionTimePreview: jest.fn(),
  applyProductionTimeToAll: jest.fn(),
  addGroup: jest.fn(),
  addPrepStep: jest.fn(),
  reorderPrepSteps: jest.fn(),
  submitForReview: jest.fn(),
}));

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
    ...overrides,
  };
}

describe("the listing editor", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    usePhotoPolicy.setState({ confirmed: [] });
    useSheets.setState({ photoPolicy: null });
    (saveListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });
    (loadPrepSteps as jest.Mock).mockResolvedValue({ status: "ok", value: [] });
    (addGroup as jest.Mock).mockResolvedValue({ status: "ok", value: null });
    (addPrepStep as jest.Mock).mockResolvedValue({ status: "ok", value: null });
    (reorderPrepSteps as jest.Mock).mockResolvedValue({ status: "ok", value: null });
    (loadProductionTimePreview as jest.Mock).mockResolvedValue({
      status: "ok",
      value: {
        earliestReadyBy: new Date("2026-10-24T05:00:00.000Z"),
        securedReadyBy: new Date("2026-10-27T05:00:00.000Z"),
        days: [
          { day: "2026-10-24", status: "tight", reason: null, readyBy: new Date("2026-10-24T05:00:00.000Z"), rushTier: null },
          { day: "2026-10-25", status: "not_possible", reason: "gridgo_closed_sunday", readyBy: null, rushTier: null },
          { day: "2026-10-27", status: "secured", reason: null, readyBy: new Date("2026-10-27T05:00:00.000Z"), rushTier: null },
        ],
      },
    });
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

  it("still loads as one page, not the add-a-listing wizard", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("PRICE")).toBeTruthy();
    expect(screen.getByText("PRODUCTION TIME")).toBeTruthy();
    expect(screen.getByText("WHAT A CLIENT PICKS")).toBeTruthy();
    expect(screen.getByText("ARTWORK YOU ACCEPT")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Proceed" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Place on Board" })).toBeNull();
    expect(screen.queryByLabelText("Add a listing steps")).toBeNull();
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

  it("marks print layouts, says clients must choose and that review applies, and saves the set", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({ reviewStatus: "approved", hasApprovedVersion: true, basePriceMinor: 45000 }),
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("PRINT LAYOUTS")).toBeTruthy();
    expect(screen.getByText("With none marked, clients are not asked about layout.")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Actual size, centred"));
    await fireEvent.press(screen.getByLabelText("Fit to paper"));

    expect(screen.getByText("Clients must choose one of these layouts before they can order this listing.")).toBeTruthy();
    expect(
      screen.getByText(
        "Saving sends this change to the GRIDGO Team for review. Until it is approved, clients keep the layouts they see now.",
      ),
    ).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("See what clients see"));

    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1", version: 7 }),
        // Canonical order, whatever order they were ticked in.
        expect.objectContaining({ printLayouts: ["fit_to_paper", "actual_size_centered"] }),
      ),
    );
  });

  it("asks how long it takes and saves Days as a productionTime range", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("How long does this take?")).toBeTruthy();
    // No time anywhere: nothing is chosen until the shop picks.
    expect(screen.getByText("No production time yet, so clients cannot be offered a date. Pick one.")).toBeTruthy();
    await fireEvent.press(within(screen.getByLabelText("How long does this take?")).getByText("Days"));
    expect(screen.getByLabelText("To how many working days").props.accessibilityValue).toEqual({ text: "3 working days" });
    await fireEvent.press(screen.getByLabelText("Increase To how many working days"));
    expect(screen.getByLabelText("To how many working days").props.accessibilityValue).toEqual({ text: "4 working days" });
    expect(screen.queryByRole("switch", { name: "Express" })).toBeNull();

    // GRIDGO's own dates for the answer, once the shop stops tapping, in the dashboard's words.
    expect(await screen.findByText("Dates clients will see")).toBeTruthy();
    expect(
      await screen.findByText(
        "If a client orders now, the soonest it can be ready is Sat 24 Oct, 1:00 PM. Dates from Tue 27 Oct, 1:00 PM are Secured.",
      ),
    ).toBeTruthy();
    expect(screen.getByText("Tight")).toBeTruthy();
    expect(screen.getByText("Ready by Sat 24 Oct, 1:00 PM")).toBeTruthy();
    expect(screen.getByText("Not offered")).toBeTruthy();
    expect(screen.getByText("GRIDGO is closed on Sundays")).toBeTruthy();
    expect(loadProductionTimePreview).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: "sci_1" }),
      { mode: "days", minDays: 1, maxDays: 4 },
    );

    await fireEvent.changeText(screen.getByLabelText("Your price"), "450");
    await fireEvent.press(screen.getByLabelText("See what clients see"));

    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1" }),
        expect.objectContaining({ productionTime: { mode: "days", minDays: 1, maxDays: 4 } }),
      ),
    );
    const patch = (saveListing as jest.Mock).mock.calls.at(-1)?.[1];
    expect(patch).not.toHaveProperty("turnaroundMode");
    expect(patch).not.toHaveProperty("turnaroundDays");
    expect(patch).not.toHaveProperty("express");
  });

  // Report 39853344: a job a shop finishes in an hour was promised a working day later.
  it("saves Same day as exact hours", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });

    view = await render(<ListingScreen />);

    await fireEvent.press(within(await screen.findByLabelText("How long does this take?")).getByText("Same day"));
    expect(screen.getByText("Ready in")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Increase Ready in how many hours"));
    expect(screen.getByLabelText("Ready in how many hours").props.accessibilityValue).toEqual({ text: "2½ hours" });
    await fireEvent.changeText(screen.getByLabelText("Your price"), "450");
    await fireEvent.press(screen.getByLabelText("See what clients see"));

    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1" }),
        expect.objectContaining({ productionTime: { mode: "same_day", hours: 2.5 } }),
      ),
    );
  });

  it("leaves the production time out of a save that did not touch it", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({ productionTime: { mode: "days", minDays: 1, maxDays: 2 } }),
    });

    view = await render(<ListingScreen />);

    await fireEvent.changeText(await screen.findByLabelText("Your price"), "450");
    await fireEvent.press(screen.getByLabelText("See what clients see"));

    await waitFor(() => expect(saveListing).toHaveBeenCalled());
    expect((saveListing as jest.Mock).mock.calls.at(-1)?.[1]).not.toHaveProperty("productionTime");
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

  it("asks a tarpaulin listing for max printer width in feet before it can go up", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({
        description: "Printed on 13oz matte tarpaulin.",
        basePriceMinor: 45000,
        turnaroundMode: "override",
        turnaround: { unit: "days" as const, days: 1 },
        fileFormatMode: "override",
        formatCodes: ["pdf"],
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        printerMaxWidthFeet: null,
      }),
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByLabelText("Max printer width in feet")).toBeTruthy();
    expect(screen.getByText(/5 ft printers/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Put on the board" }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(
      screen.getAllByText("Set your max printer width in feet before it can go on the board.").length,
    ).toBeGreaterThan(0);

    await fireEvent.press(screen.getByLabelText("Increase Max printer width in feet"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Put on the board" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });

    await fireEvent.press(screen.getByRole("button", { name: "Put on the board" }));
    // Photo policies first: nothing goes up until the shop confirms.
    await waitFor(() => expect(useSheets.getState().photoPolicy?.request.moment).toBe("submit"));
    expect(saveListing).not.toHaveBeenCalled();
    await act(async () => settlePhotoPolicy("confirmed"));
    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1" }),
        expect.objectContaining({ printerMaxWidthFeet: 1, active: true }),
      ),
    );
  });

  it("hides the printer cap on every other kind of work and clears it on save", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: listingWith({ printerMaxWidthFeet: 5 }),
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByLabelText("Max printer width in feet")).toBeTruthy();
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    expect(screen.queryByLabelText("Max printer width in feet")).toBeNull();

    await fireEvent.press(screen.getByLabelText("See what clients see"));

    await waitFor(() =>
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1" }),
        expect.objectContaining({
          subcategoryCode: "flyers",
          printerMaxWidthFeet: null,
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
  it("saves an edited price using the version advanced by adding a prep step", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok", value: listingWith({ basePriceMinor: 10000 }),
    });
    view = await render(<ListingScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Your price"), "150");
    await fireEvent.press(screen.getByLabelText("Add a step to Before they order"));
    await fireEvent.changeText(screen.getByLabelText("Step title"), "Flatten your artwork");
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok", value: listingWith({ basePriceMinor: 10000, version: 8 }),
    });
    await fireEvent.press(screen.getByRole("button", { name: "Add step" }));
    await waitFor(() => expect(screen.queryByLabelText("Step title")).toBeNull());
    expect(addPrepStep).toHaveBeenCalledWith(
      expect.objectContaining({ version: 7 }),
      [],
      expect.objectContaining({ title: "Flatten your artwork" }),
    );
    expect(screen.getByLabelText("Your price").props.value).toBe("150");
    await fireEvent.press(screen.getByLabelText("See what clients see"));
    expect(saveListing).toHaveBeenCalledWith(
      expect.objectContaining({ version: 8 }),
      expect.objectContaining({ basePriceMinor: 15000 }),
    );
    expect(router.push).toHaveBeenCalledWith({
      pathname: "/shop/[id]/preview", params: { id: "sci_1" },
    });
  });

  it("adopts a remote price while clean without saving the previous price", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith({ basePriceMinor: 10000 }) });
    view = await render(<ListingScreen />);
    await screen.findByLabelText("Your price");
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith({ basePriceMinor: 20000, version: 8 }) });
    const { invalidate } = jest.requireActual("@/lib/live");
    await act(async () => { invalidate("catalog"); });
    await waitFor(() => expect(screen.getByLabelText("Your price").props.value).toBe("200.00"));
    await fireEvent.press(screen.getByLabelText("See what clients see"));
    expect(saveListing).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalled();
  });

  it("keeps an edit and its original version when a live request finishes", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith({ basePriceMinor: 10000 }) });
    view = await render(<ListingScreen />);
    await screen.findByLabelText("Your price");
    let receive!: (value: { status: "ok"; value: Listing }) => void;
    (loadListing as jest.Mock).mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }));
    const { invalidate } = jest.requireActual("@/lib/live");
    await act(async () => { invalidate("catalog"); });
    await waitFor(() => expect(loadListing).toHaveBeenCalledTimes(2));
    await fireEvent.changeText(screen.getByLabelText("Your price"), "150");
    await act(async () => { receive({ status: "ok", value: listingWith({ basePriceMinor: 20000, version: 8 }) }); });
    expect(screen.getByLabelText("Your price").props.value).toBe("150");
    await fireEvent.press(screen.getByLabelText("See what clients see"));
    expect(saveListing).toHaveBeenCalledWith(expect.objectContaining({ version: 7 }), expect.objectContaining({ basePriceMinor: 15000 }));
  });

});

/** A finished listing: everything review asks for, including a required spec. */
function finishedListing(overrides: Partial<Listing> = {}): Listing {
  return listingWith({
    subcategoryCode: "flyers",
    basePriceMinor: 40000,
    fileFormatMode: "override",
    formatCodes: ["pdf"],
    photos: [{ fileId: "file_1", sortOrder: 0, altText: null, downloadUrl: null, downloadUrlExpiresAt: null }],
    groups: [
      {
        id: "grp_1",
        name: "Size",
        kind: "spec",
        required: true,
        helpText: null,
        sortOrder: 0,
        version: 1,
        options: [
          { id: "opt_1", label: "A5", priceModifierMinor: 0, priceMultiplierBps: null, active: true, sortOrder: 0 },
        ],
      },
    ],
    reviewStatus: "pending",
    reviewReason: null,
    reviewedAt: null,
    hasApprovedVersion: false,
    ...overrides,
  });
}

describe("the listing editor under review and take-down", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    // The photo policies were already confirmed for this listing.
    usePhotoPolicy.setState({ confirmed: ["sci_1"] });
    useSheets.setState({ photoPolicy: null });
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

  it("shows a take-down as Taken down by GRIDGO, with the reason and when, and no way back up", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: finishedListing({
        hasApprovedVersion: true,
        reviewStatus: "approved",
        suspendReason: "The sample carries a shop logo",
        suspendedAt: "2026-10-05T13:55:00.000Z",
      }),
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("Taken down by GRIDGO")).toBeTruthy();
    expect(screen.getByText("The sample carries a shop logo")).toBeTruthy();
    expect(screen.getByText(/^Taken down Oct 5, 2026/)).toBeTruthy();
    expect(screen.queryByText("Hidden by you")).toBeNull();
    expect(screen.queryByRole("button", { name: "Put on the board" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
  });

  it("submits a sent-back listing again, putting it up in the same save", async () => {
    const sentBack = finishedListing({
      reviewStatus: "needs_revision",
      reviewReason: "Show the flyer without your logo",
      reviewedAt: "2026-10-05T02:00:00.000Z",
    });
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: sentBack });
    (saveListing as jest.Mock).mockResolvedValue({ status: "ok", value: { ...sentBack, onTheBoard: true } });
    (submitForReview as jest.Mock).mockResolvedValue({
      status: "ok",
      value: { ...sentBack, onTheBoard: true, reviewStatus: "pending", reviewReason: null },
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("Needs changes")).toBeTruthy();
    expect(screen.getByText("What Operations asked for")).toBeTruthy();
    expect(screen.getByText("Show the flyer without your logo")).toBeTruthy();

    await fireEvent.press(screen.getByRole("button", { name: "Submit for review" }));

    await waitFor(() => expect(submitForReview).toHaveBeenCalled());
    expect(saveListing).toHaveBeenCalledWith(
      expect.objectContaining({ id: "sci_1" }),
      expect.objectContaining({ active: true }),
    );
    expect(await screen.findByText(/^Sent to Operations for review/)).toBeTruthy();
  });

  it("names the missing spec instead of offering a submission that would be refused", async () => {
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: finishedListing({ groups: [] }) });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("Not ready yet")).toBeTruthy();
    const submit = screen.getByRole("button", { name: "Submit for review" });
    expect(submit.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
  });

  it("reads Pending review once a new listing is with Operations, and only saves", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: finishedListing({ onTheBoard: true }),
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("Pending review")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Submit for review" })).toBeNull();
    expect(screen.getByRole("button", { name: "Saved" })).toBeTruthy();
  });

  it("keeps an approved listing Live while its edits wait for review", async () => {
    (loadListing as jest.Mock).mockResolvedValue({
      status: "ok",
      value: finishedListing({ onTheBoard: true, hasApprovedVersion: true, reviewStatus: "pending" }),
    });

    view = await render(<ListingScreen />);

    expect(await screen.findByText("Live")).toBeTruthy();
    expect(screen.getByText("Pending review")).toBeTruthy();
    expect(screen.getByText(/Clients see the approved version until then/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Take it off the board" })).toBeTruthy();
  });

  describe("Check your production time", () => {
    const flagged = (reason: string, productionTime: Listing["productionTime"]) =>
      listingWith({ productionTime, productionTimeReview: { required: true, reasons: [reason] } });

    it("asks the shop to confirm a time GRIDGO rounded up, and Keep 1 working day saves it", async () => {
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: flagged("legacy_one_working_day", { mode: "days", minDays: 1, maxDays: 1 }),
      });

      view = await render(<ListingScreen />);

      expect(await screen.findByText("Check your production time")).toBeTruthy();
      expect(
        screen.getByText(
          "This listing has an older 1-working-day setting. Confirm it, or set the time it really takes.",
        ),
      ).toBeTruthy();
      await fireEvent.press(screen.getByRole("button", { name: "Keep 1 working day" }));

      // Saves the held time on its own, nothing else.
      await waitFor(() =>
        expect(saveListing).toHaveBeenCalledWith(expect.objectContaining({ id: "sci_1" }), {
          productionTime: { mode: "days", minDays: 1, maxDays: 1 },
        }),
      );
    });

    it("says to save instead once the shop has changed the time", async () => {
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: flagged("legacy_one_working_day", { mode: "days", minDays: 1, maxDays: 1 }),
      });

      view = await render(<ListingScreen />);

      await fireEvent.press(await screen.findByLabelText("Increase To how many working days"));
      expect(screen.queryByRole("button", { name: "Keep 1 working day" })).toBeNull();
      expect(screen.getByText(/Save to confirm it/)).toBeTruthy();
    });

    it("asks a former Express listing for its hours, with nothing to keep", async () => {
      (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: flagged("express_missing_hours", null) });

      view = await render(<ListingScreen />);

      expect(await screen.findByText("Check your production time")).toBeTruthy();
      expect(
        screen.getByText(
          "This was an Express listing with no production time. Express is now Same day: say how many hours it takes.",
        ),
      ).toBeTruthy();
      expect(screen.queryByRole("button", { name: /^Keep / })).toBeNull();
      expect(screen.getByText("No production time yet, so clients cannot be offered a date. Pick one.")).toBeTruthy();
    });

    it("holds a Same day time of a working day or more without breaking, and asks for Days", async () => {
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: listingWith({ productionTime: { mode: "same_day", minutes: 720 } }),
      });

      view = await render(<ListingScreen />);

      expect(await screen.findByText("How long does this take?")).toBeTruthy();
      expect(screen.getByLabelText("Ready in how many hours").props.accessibilityValue).toEqual({ text: "12 hours" });
      expect(
        screen.getByText(
          "This listing still holds a time longer than one working day. Choose Days to set it in working days.",
        ),
      ).toBeTruthy();
      // Nothing is asked of GRIDGO for a time it would refuse.
      expect(screen.getByText("Fix the time above to see the dates.")).toBeTruthy();
      expect(loadProductionTimePreview).not.toHaveBeenCalled();
      await fireEvent.press(within(screen.getByLabelText("How long does this take?")).getByText("Days"));
      expect(await screen.findByText(/^If a client orders now/)).toBeTruthy();
    });

    it("shows nothing on a listing GRIDGO did not flag", async () => {
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: listingWith({ productionTime: { mode: "same_day", minutes: 120 } }),
      });

      view = await render(<ListingScreen />);

      expect(await screen.findByText("How long does this take?")).toBeTruthy();
      expect(screen.queryByText("Check your production time")).toBeNull();
      expect(screen.getByLabelText("Ready in how many hours").props.accessibilityValue).toEqual({ text: "2 hours" });
    });
  });

  describe("More options", () => {
    it("keeps the faster price tiers under More options", async () => {
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: listingWith({
          productionTime: { mode: "days", minDays: 2, maxDays: 3 },
          speedTiers: [
            { id: "speed_1", label: "Rush", turnaround: { unit: "hours", minutes: 240 }, priceMinor: 90000, surchargeMinor: null },
          ],
        }),
      });

      view = await render(<ListingScreen />);

      await fireEvent.press(await screen.findByRole("button", { name: /More options/ }));
      expect(screen.getByText("Faster price options")).toBeTruthy();
      expect(screen.getByText("Rush")).toBeTruthy();
    });

    it("asks before using this time for all listings, then applies it", async () => {
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: listingWith({ productionTime: { mode: "same_day", minutes: 120 } }),
      });
      (applyProductionTimeToAll as jest.Mock).mockResolvedValue({ status: "ok", value: 8 });

      view = await render(<ListingScreen />);

      await fireEvent.press(await screen.findByRole("button", { name: /More options/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Use for all my listings" }));
      await waitFor(() => expect(useSheets.getState().confirm).not.toBeNull());
      expect(useSheets.getState().confirm?.request).toEqual(
        expect.objectContaining({
          question: "Use Same day, ready in 2 hours for all your listings?",
          confirmLabel: "Use for all",
          cancelLabel: "Cancel",
        }),
      );
      expect(applyProductionTimeToAll).not.toHaveBeenCalled();
      await act(async () => settleConfirm(true));

      await waitFor(() => expect(applyProductionTimeToAll).toHaveBeenCalledWith({ mode: "same_day", minutes: 120 }));
      expect(await screen.findByText("Done. All 8 listings take Same day, ready in 2 hours now.")).toBeTruthy();
    });

    it("keeps an edit made while it applies, and sends it on the new version without the old time", async () => {
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: listingWith({ productionTime: { mode: "days", minDays: 2, maxDays: 3 } }),
      });
      let finish: (value: unknown) => void = () => undefined;
      (applyProductionTimeToAll as jest.Mock).mockReturnValue(new Promise((resolve) => (finish = resolve)));

      view = await render(<ListingScreen />);

      await fireEvent.press(await screen.findByRole("button", { name: /More options/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Use for all my listings" }));
      await waitFor(() => expect(useSheets.getState().confirm).not.toBeNull());
      await act(async () => settleConfirm(true));
      await waitFor(() => expect(applyProductionTimeToAll).toHaveBeenCalled());

      // The shop types a price while GRIDGO is still applying.
      await fireEvent.changeText(screen.getByLabelText("Your price"), "450");
      (loadListing as jest.Mock).mockResolvedValue({
        status: "ok",
        value: listingWith({ version: 8, productionTime: { mode: "days", minDays: 2, maxDays: 3 } }),
      });
      await act(async () => finish({ status: "ok", value: 8 }));
      expect(await screen.findByText("Done. All 8 listings take 2 to 3 working days now.")).toBeTruthy();
      expect(screen.getByLabelText("Your price").props.value).toBe("450");
      expect(saveListing).not.toHaveBeenCalled();

      await fireEvent.press(screen.getByLabelText("See what clients see"));
      await waitFor(() =>
        expect(saveListing).toHaveBeenCalledWith(
          expect.objectContaining({ version: 8 }),
          expect.objectContaining({ basePriceMinor: 45000 }),
        ),
      );
      expect((saveListing as jest.Mock).mock.calls.at(-1)?.[1]).not.toHaveProperty("productionTime");
    });

    it("says so when the listing cannot be refreshed, instead of showing the old one as current", async () => {
      (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: listingWith() });
      (applyProductionTimeToAll as jest.Mock).mockResolvedValue({ status: "ok", value: 8 });

      view = await render(<ListingScreen />);

      await fireEvent.press(within(await screen.findByLabelText("How long does this take?")).getByText("Days"));
      (loadListing as jest.Mock).mockResolvedValue({ status: "failed", message: "Check this phone's connection." });
      await fireEvent.press(screen.getByRole("button", { name: /More options/ }));
      await fireEvent.press(screen.getByRole("button", { name: "Use for all my listings" }));
      await waitFor(() => expect(useSheets.getState().confirm).not.toBeNull());
      await act(async () => settleConfirm(true));

      expect(
        await screen.findByText(
          "This listing could not be refreshed, so what you see may be out of date. Check this phone's connection.",
        ),
      ).toBeTruthy();
    });
  });
});
