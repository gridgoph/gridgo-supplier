import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/hooks/useBoard", () => ({
  useBoard: jest.fn(),
  useListing: jest.fn(),
  routeId: jest.requireActual<typeof import("@/hooks/useBoard")>("@/hooks/useBoard").routeId,
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadStarters: jest.fn(),
  createListing: jest.fn(),
  saveListing: jest.fn(),
  setFileFormats: jest.fn(),
  addGroup: jest.fn(),
}));

jest.mock("@/lib/starterSample", () => ({
  seedStarterSample: jest.fn(),
}));

import { router } from "expo-router";

import NewListingScreen from "@/app/shop/new";
import { useBoard, useListing } from "@/hooks/useBoard";
import type { Listing } from "@/lib/listings";
import { addGroup, loadStarters, saveListing, setFileFormats } from "@/lib/listingsApi";
import { useListingWizard } from "@/store/listingWizard";
import type { ServiceCatalog } from "@/lib/taxonomy";

const catalog: ServiceCatalog = {
  source: "platform",
  canDeclare: true,
  aliases: {},
  categories: [
    {
      code: "marketing_promotional",
      name: "Marketing & Promotional Collateral",
      bestFor: "Flyers and banners",
      declarable: true,
      materials: [],
      finishes: [],
      covers: [
        { code: "flyers", name: "Flyers", examples: "Handouts" },
        {
          code: "tarpaulins_outdoor_banners",
          name: "Tarpaulins & outdoor banners",
          examples: "Event banners",
        },
      ],
    },
  ],
};

const services = [
  {
    id: "svc_1",
    categoryCode: "marketing_promotional",
    state: "live",
    turnaroundHours: 48,
    formatCodes: ["pdf"],
  },
];

function listingWith(overrides: Partial<Listing> = {}): Listing {
  return {
    id: "item_1",
    serviceLineId: "svc_1",
    subcategoryCode: "flyers",
    name: "Flyers",
    description: "",
    basePriceMinor: 0,
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
    photos: [],
    groups: [],
    version: 1,
    updatedAt: null,
    ...overrides,
  };
}

let mockListing: Listing;

function openAt(step: "about" | "price" | "speed" | "steps" | "artwork" | "review", listing: Listing) {
  mockListing = listing;
  useListingWizard.setState({ listingId: listing.id, step, furthest: step });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListing = listingWith();
  useListingWizard.setState({ listingId: null, step: "pick", furthest: "pick" });
  (useBoard as jest.Mock).mockReturnValue({
    catalog,
    services,
    listings: [],
    loading: false,
    loaded: true,
    notOpenYet: false,
    error: null,
    reload: jest.fn(),
    dropListing: jest.fn(),
  });
  (useListing as jest.Mock).mockImplementation((id: string | null) => ({
    listing: id ? mockListing : null,
    catalog,
    services,
    prepSteps: [],
    prepStepsOpen: true,
    loading: false,
    notOpenYet: false,
    error: null,
    reload: jest.fn(async () => {}),
  }));
  (saveListing as jest.Mock).mockImplementation(async (listing: Listing, patch: Record<string, unknown>) => {
    mockListing = {
      ...listing,
      ...patch,
      onTheBoard: patch.active === true ? true : listing.onTheBoard,
    };
    return { status: "ok", value: mockListing };
  });
  (setFileFormats as jest.Mock).mockImplementation(async (listing: Listing, mode: Listing["fileFormatMode"], codes: string[]) => {
    mockListing = { ...listing, fileFormatMode: mode, formatCodes: codes };
    return { status: "ok", value: mockListing };
  });
  (addGroup as jest.Mock).mockResolvedValue({ status: "ok", value: null });
  (loadStarters as jest.Mock).mockResolvedValue({ status: "ok", value: [] });
});

describe("Add a listing — later steps", () => {
  it("blocks About Proceed without a photo and names the photo", async () => {
    openAt("about", listingWith({ photos: [], name: "Flyers" }));
    await render(<NewListingScreen />);

    expect(await screen.findByText("Describe your product")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    expect(await screen.findByText("Add at least one sample photo before it can go on the board.")).toBeTruthy();
    expect(screen.getByText("Describe your product")).toBeTruthy();
    expect(saveListing).not.toHaveBeenCalled();
  });

  it("writes pricingUnit and basePriceMinor via saveListing on Price Proceed", async () => {
    openAt(
      "price",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Event flyers",
      }),
    );
    await render(<NewListingScreen />);

    expect(await screen.findByText("Set your product price")).toBeTruthy();
    expect(screen.queryByLabelText("Pieces in a pack")).toBeNull();
    expect(screen.queryByText("Cheaper in bulk — optional. From this many, your rate becomes the one you set here.")).toBeNull();
    expect(screen.queryByLabelText("Smallest order you will take")).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "Per pack" }));
    await fireEvent.changeText(screen.getByLabelText("Your price"), "450");
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "item_1" }),
        expect.objectContaining({
          pricingUnit: "per_package",
          basePriceMinor: 45000,
        }),
      );
    });
    const patch = (saveListing as jest.Mock).mock.calls[0][1];
    expect(patch.active).toBeUndefined();
    expect(await screen.findByText("Set your capacity & speed")).toBeTruthy();
  });

  it("sends a measure unit when Price is per length", async () => {
    openAt(
      "price",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Vinyl lettering",
      }),
    );
    await render(<NewListingScreen />);

    await fireEvent.press(await screen.findByRole("radio", { name: "Per length" }));
    await fireEvent.changeText(screen.getByLabelText("Your price"), "15");
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "item_1" }),
        expect.objectContaining({
          pricingUnit: "per_length",
          basePriceMinor: 1500,
          measureUnit: "ft",
        }),
      );
    });
  });

  it("shows pack qty, bulk breaks and MOQ on Speed, not Price", async () => {
    openAt(
      "speed",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Event flyers",
        pricingUnit: "per_package",
        packageQty: 100,
        basePriceMinor: 45000,
      }),
    );
    await render(<NewListingScreen />);

    expect(await screen.findByLabelText("Pieces in a pack")).toBeTruthy();
    expect(screen.getByText(/Cheaper in bulk/)).toBeTruthy();
    expect(screen.getByLabelText("Smallest order you will take")).toBeTruthy();
    expect(screen.getByLabelText("Minimum production time")).toBeTruthy();
    expect(screen.getByLabelText("Maximum production time")).toBeTruthy();
    expect(screen.queryByText(/Faster, for more/)).toBeNull();
    expect(screen.queryByText("Your usual time")).toBeNull();
  });

  it("writes the production window on Speed Proceed and does not send a faster option", async () => {
    openAt(
      "speed",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Event flyers",
        basePriceMinor: 45000,
        turnaroundMode: "inherit",
        turnaroundHours: null,
      }),
    );
    await render(<NewListingScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "item_1" }),
        expect.objectContaining({
          turnaroundMode: "override",
          minimumTurnaroundHours: 48,
          turnaroundHours: 48,
          speedTiers: [],
        }),
      );
    });
  });

  it("saves a step as soon as it is added", async () => {
    openAt(
      "steps",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Event flyers",
        basePriceMinor: 45000,
      }),
    );
    await render(<NewListingScreen />);

    await fireEvent.press(await screen.findByLabelText("Add a step"));
    await fireEvent.changeText(screen.getByLabelText("Step name"), "Size");
    await fireEvent.changeText(screen.getByLabelText("First choice"), "2 × 3 ft");
    await fireEvent.press(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => {
      expect(addGroup).toHaveBeenCalledWith(
        expect.objectContaining({ id: "item_1" }),
        expect.objectContaining({
          name: "Size",
          kind: "spec",
          firstOption: expect.objectContaining({ label: "2 × 3 ft" }),
        }),
      );
    });
  });

  it("sends inherit formats and refuses override with none", async () => {
    openAt(
      "artwork",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Event flyers",
        basePriceMinor: 45000,
        fileFormatMode: "inherit",
        formatCodes: [],
      }),
    );
    await render(<NewListingScreen />);

    expect(await screen.findByText("How can the client help you?")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(saveListing).toHaveBeenCalled();
    });
    expect(setFileFormats).not.toHaveBeenCalled();
    expect(await screen.findByText("Finalize your product")).toBeTruthy();
  });

  it("requires at least one format when the listing overrides artwork", async () => {
    openAt(
      "artwork",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Event flyers",
        basePriceMinor: 45000,
        fileFormatMode: "inherit",
        formatCodes: [],
      }),
    );
    await render(<NewListingScreen />);

    await fireEvent.press(await screen.findByText("Just this listing"));
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    expect(
      await screen.findByText("Say which artwork files you accept for this listing."),
    ).toBeTruthy();
    expect(setFileFormats).not.toHaveBeenCalled();
  });

  it("writes override formats through setFileFormats", async () => {
    openAt(
      "artwork",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Event flyers",
        basePriceMinor: 45000,
        fileFormatMode: "inherit",
        formatCodes: [],
      }),
    );
    await render(<NewListingScreen />);

    await fireEvent.press(await screen.findByText("Just this listing"));
    await fireEvent.press(screen.getByLabelText("PDF"));
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(setFileFormats).toHaveBeenCalledWith(
        expect.objectContaining({ id: "item_1" }),
        "override",
        expect.arrayContaining(["pdf"]),
      );
    });
  });

  it("disables Place on Board while GRIDGO still needs something", async () => {
    openAt(
      "review",
      listingWith({
        name: "Flyers",
        photos: [],
        basePriceMinor: 45000,
      }),
    );
    await render(<NewListingScreen />);

    expect(await screen.findByText("Finalize your product")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Place on Board" }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
    expect(screen.getByText("Add at least one sample photo before it can go on the board.")).toBeTruthy();
  });

  it("places a complete listing on the board and does not reopen create", async () => {
    openAt(
      "review",
      listingWith({
        name: "Event flyers",
        description: "A5 handouts",
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        basePriceMinor: 45000,
        fileFormatMode: "inherit",
        formatCodes: [],
      }),
    );
    await render(<NewListingScreen />);

    await fireEvent.press(await screen.findByRole("button", { name: "Place on Board" }));

    await waitFor(() => {
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "item_1" }),
        expect.objectContaining({ active: true }),
      );
    });
    expect(router.replace).toHaveBeenCalledWith("/(tabs)/catalogues");
  });

  it("saves a draft without putting the listing on the board", async () => {
    openAt(
      "about",
      listingWith({
        photos: [{ fileId: "file_1", sortOrder: 0, altText: null }],
        name: "Flyers",
      }),
    );
    await render(<NewListingScreen />);

    await fireEvent.changeText(await screen.findByLabelText("Listing name"), "Night market flyers");
    await fireEvent.press(screen.getByRole("button", { name: "Save draft" }));

    await waitFor(() => {
      expect(saveListing).toHaveBeenCalledWith(
        expect.objectContaining({ id: "item_1" }),
        expect.objectContaining({ name: "Night market flyers" }),
      );
    });
    const patch = (saveListing as jest.Mock).mock.calls[0][1];
    expect(patch.active).toBeUndefined();
    expect(screen.getByText("Describe your product")).toBeTruthy();
  });
});
