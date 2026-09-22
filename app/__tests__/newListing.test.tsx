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

jest.mock("@/store/sheets", () => ({
  askConfirm: jest.fn(async () => true),
}));

import { router } from "expo-router";

import NewListingScreen from "@/app/shop/new";
import { useBoard, useListing } from "@/hooks/useBoard";
import type { Listing } from "@/lib/listings";
import { createListing, loadStarters, saveListing } from "@/lib/listingsApi";
import { seedStarterSample } from "@/lib/starterSample";
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
        { code: "brochures", name: "Brochures", examples: "Folds" },
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

const flyersStarter = {
  id: "lst_flyers",
  name: "Flyers",
  subcategoryCode: "flyers",
  pricingUnit: "per_package" as const,
  packageQty: 100,
  measureUnit: null,
  minimumWidthMilli: null,
  minimumHeightMilli: null,
  minimumLengthMilli: null,
  minimumOrderQuantity: null,
  priceTiers: [],
  speedTiers: [],
  turnaroundHours: 48,
  formatCodes: ["pdf"],
  specCount: 3,
  addOnCount: 1,
};

function createdListing(overrides: Partial<Listing> = {}): Listing {
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

let mockListing: Listing | null = null;

beforeEach(() => {
  jest.clearAllMocks();
  mockListing = null;
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
  (loadStarters as jest.Mock).mockResolvedValue({ status: "ok", value: [flyersStarter] });
  (createListing as jest.Mock).mockImplementation(async (input: { name: string; subcategoryCode: string }) => {
    mockListing = createdListing({
      name: input.name,
      subcategoryCode: input.subcategoryCode,
    });
    return { status: "ok", value: mockListing };
  });
  (saveListing as jest.Mock).mockImplementation(async (listing: Listing, patch: Record<string, unknown>) => {
    mockListing = { ...listing, ...patch, onTheBoard: patch.active === true };
    return { status: "ok", value: mockListing };
  });
  (seedStarterSample as jest.Mock).mockResolvedValue({ status: "ok", value: null });
});

describe("Add a listing — Pick", () => {
  it("names every later stage on Pick, even before the listing exists", async () => {
    await render(<NewListingScreen />);

    expect(await screen.findByLabelText("Pick")).toBeTruthy();
    expect(screen.getByLabelText("About")).toBeTruthy();
    expect(screen.getByLabelText("Price")).toBeTruthy();
    expect(screen.getByLabelText("Speed")).toBeTruthy();
    expect(screen.getByLabelText("Steps")).toBeTruthy();
    expect(screen.getByLabelText("Artwork")).toBeTruthy();
    expect(screen.getByLabelText("Review")).toBeTruthy();
    expect(screen.getByLabelText("Price").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );
  });

  it("loads the GRIDGO starter for Flyers and selects it", async () => {
    await render(<NewListingScreen />);

    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));

    await waitFor(() => {
      expect(loadStarters).toHaveBeenCalledWith("flyers");
    });
    expect(
      await screen.findByRole("radio", { name: "GRIDGO starter, Flyers", checked: true }),
    ).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Start blank", checked: false })).toBeTruthy();
  });

  it("creates a hidden listing on first Proceed and seeds the starter sample", async () => {
    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    await screen.findByRole("radio", { name: "GRIDGO starter, Flyers" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Proceed" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          starterId: "lst_flyers",
          name: "Flyers",
        }),
      );
    });
    const body = (createListing as jest.Mock).mock.calls[0][0];
    expect(body).not.toHaveProperty("photos");
    expect(body.printerMaxWidthFeet).toBeNull();
    expect(seedStarterSample).toHaveBeenCalledWith("lst_flyers", "item_1");
    expect(router.replace).not.toHaveBeenCalled();
    expect(await screen.findByText("Describe your product")).toBeTruthy();
  });

  it("still continues when copying the starter sample throws", async () => {
    (seedStarterSample as jest.Mock).mockRejectedValue(new Error("no cache directory"));
    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    await screen.findByRole("radio", { name: "GRIDGO starter, Flyers" });
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Proceed" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(createListing).toHaveBeenCalled();
    });
    expect(await screen.findByText("Describe your product")).toBeTruthy();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it("still opens a blank listing when the shop asks for one", async () => {
    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    await screen.findByRole("radio", { name: "GRIDGO starter, Flyers" });

    await fireEvent.press(screen.getByRole("radio", { name: "Start blank" }));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Proceed" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          starterId: null,
          name: "Flyers",
        }),
      );
    });
    expect(seedStarterSample).not.toHaveBeenCalled();
  });

  it("does not require a typed name on Pick", async () => {
    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    await screen.findByRole("radio", { name: "GRIDGO starter, Flyers" });
    expect(screen.queryByLabelText("Listing name")).toBeNull();
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Proceed" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
  });

  it("hides the printer cap on Flyers and requires it on tarpaulin", async () => {
    const tarpStarter = {
      ...flyersStarter,
      id: "lst_tarpaulins_outdoor_banners",
      name: "Tarpaulin",
      subcategoryCode: "tarpaulins_outdoor_banners",
      pricingUnit: "per_unit" as const,
      packageQty: null,
    };
    (loadStarters as jest.Mock).mockImplementation(async (code: string) =>
      code === "tarpaulins_outdoor_banners"
        ? { status: "ok", value: [tarpStarter] }
        : { status: "ok", value: [flyersStarter] },
    );

    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    expect(screen.queryByLabelText("Max printer width in feet")).toBeNull();

    await fireEvent.press(screen.getByRole("radio", { name: "Tarpaulins & outdoor banners" }));
    expect(await screen.findByLabelText("Max printer width in feet")).toBeTruthy();
    expect(screen.getByText(/5 ft printers/)).toBeTruthy();

    expect(screen.getByRole("button", { name: "Proceed" }).props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: true }),
    );

    await fireEvent.press(screen.getByLabelText("Increase Max printer width in feet"));
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Proceed" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Proceed" }));

    await waitFor(() => {
      expect(createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          subcategoryCode: "tarpaulins_outdoor_banners",
          name: "Tarpaulins & outdoor banners",
          printerMaxWidthFeet: 1,
        }),
      );
    });
  });

  it("does not call createListing when Cancel is pressed before create", async () => {
    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("button", { name: "Cancel" }));
    expect(createListing).not.toHaveBeenCalled();
    expect(router.back).toHaveBeenCalled();
  });

  it("starts Pick again when the session draft was removed, and does not call the board closed", async () => {
    useListingWizard.setState({ listingId: "item_gone", step: "about", furthest: "about" });
    (useListing as jest.Mock).mockImplementation((id: string | null) => ({
      listing: null,
      catalog,
      services,
      prepSteps: [],
      prepStepsOpen: true,
      loading: false,
      notOpenYet: Boolean(id),
      error: null,
      reload: jest.fn(async () => {}),
    }));

    await render(<NewListingScreen />);

    expect(await screen.findByText("Pick printing category")).toBeTruthy();
    expect(screen.queryByText("Your board is not open yet")).toBeNull();
    expect(useListingWizard.getState().listingId).toBeNull();
  });
});
