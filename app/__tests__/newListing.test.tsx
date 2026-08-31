import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

jest.mock("@/hooks/useBoard", () => ({
  useBoard: jest.fn(),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadStarters: jest.fn(),
  createListing: jest.fn(),
}));

jest.mock("@/lib/starterSample", () => ({
  seedStarterSample: jest.fn(),
}));

import { router } from "expo-router";

import NewListingScreen from "@/app/shop/new";
import { useBoard } from "@/hooks/useBoard";
import { createListing, loadStarters } from "@/lib/listingsApi";
import { seedStarterSample } from "@/lib/starterSample";
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
      ],
    },
  ],
};

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

beforeEach(() => {
  jest.clearAllMocks();
  (useBoard as jest.Mock).mockReturnValue({
    catalog,
    services: [
      {
        id: "svc_1",
        categoryCode: "marketing_promotional",
        state: "live",
        turnaroundHours: 48,
        formatCodes: ["pdf"],
      },
    ],
    listings: [],
    loading: false,
    loaded: true,
    notOpenYet: false,
    error: null,
    reload: jest.fn(),
    dropListing: jest.fn(),
  });
  (loadStarters as jest.Mock).mockResolvedValue({ status: "ok", value: [flyersStarter] });
  (createListing as jest.Mock).mockResolvedValue({
    status: "ok",
    value: { id: "item_1", photos: [], groups: [] },
  });
  (seedStarterSample as jest.Mock).mockResolvedValue({ status: "ok", value: null });
});

describe("Add a listing", () => {
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

  it("files the GRIDGO starter sample as the listing's first photo", async () => {
    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    await screen.findByRole("radio", { name: "GRIDGO starter, Flyers" });

    await fireEvent.changeText(screen.getByLabelText("Listing name"), "Event flyers");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create listing" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => {
      expect(createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          starterId: "lst_flyers",
          name: "Event flyers",
        }),
      );
    });
    const body = (createListing as jest.Mock).mock.calls[0][0];
    expect(body).not.toHaveProperty("photos");
    expect(seedStarterSample).toHaveBeenCalledWith("lst_flyers", "item_1");
    expect(router.replace).toHaveBeenCalledWith({
      pathname: "/shop/[id]",
      params: { id: "item_1" },
    });
  });

  it("still opens a blank listing when the shop asks for one", async () => {
    await render(<NewListingScreen />);
    await fireEvent.press(screen.getByRole("radio", { name: "Flyers" }));
    await screen.findByRole("radio", { name: "GRIDGO starter, Flyers" });

    await fireEvent.press(screen.getByRole("radio", { name: "Start blank" }));
    await fireEvent.changeText(screen.getByLabelText("Listing name"), "Custom flyers");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Create listing" }).props.accessibilityState).toEqual(
        expect.objectContaining({ disabled: false }),
      );
    });
    await fireEvent.press(screen.getByRole("button", { name: "Create listing" }));

    await waitFor(() => {
      expect(createListing).toHaveBeenCalledWith(
        expect.objectContaining({
          starterId: null,
          name: "Custom flyers",
        }),
      );
    });
    expect(seedStarterSample).not.toHaveBeenCalled();
  });
});
