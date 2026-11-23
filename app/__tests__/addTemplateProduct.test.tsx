import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useNavigation: () => ({ addListener: () => () => undefined }),
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
  getTaxonomy: jest.fn(async () => null),
}));

jest.mock("@/hooks/useBoard", () => ({
  loadServiceLines: jest.fn(async () => [
    { id: "svc_marketing", categoryCode: "marketing_print", state: "verified", turnaround: null, formatCodes: [] },
  ]),
}));

jest.mock("@/lib/productTemplatesApi", () => ({
  loadTemplateCatalogue: jest.fn(),
  previewTemplateProduct: jest.fn(),
  addTemplateProduct: jest.fn(),
}));

jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => false) }));

import AddProductScreen from "@/app/shop/add";
import { normalizeCatalogue } from "@/lib/productTemplates";
import { addTemplateProduct, loadTemplateCatalogue, previewTemplateProduct } from "@/lib/productTemplatesApi";
import { askConfirm } from "@/store/sheets";
import { router } from "expo-router";

const template = (id: string, name: string, categoryCode: string, extra: Record<string, unknown> = {}) => ({
  id,
  name,
  description: `${name} made to your selected specifications.`,
  categoryCode,
  subcategoryCode: id.replace("tpl_", ""),
  group: categoryCode === "marketing_print" ? "marketing" : "gifts",
  unit: "piece",
  options: [
    { key: "standard", label: "A5 / Glossy" },
    { key: "variant_1", label: "A4 / Glossy" },
  ],
  optionLists: [],
  stockPhotos: [{ url: `/product-template-photos/lst_${id}.jpg`, altText: name }],
  fileTypes: ["pdf"],
  clientTips: ["Send a clear, print-ready file."],
  express: false,
  machinesNeeded: [],
  priceRange: { minMinor: 100, maxMinor: 500000 },
  addedItemIds: [],
  ...extra,
});

const catalogue = normalizeCatalogue({
  templates: [
    template("tpl_flyers", "Flyers", "marketing_print"),
    template("tpl_business_cards", "Business cards", "marketing_print", { addedItemIds: ["sci_cards"] }),
    template("tpl_drinkware", "Drinkware", "gifts"),
  ],
  readyTimes: [
    { code: "same_day", label: "Same day" },
    { code: "next_day", label: "Next working day" },
    { code: "2_3_days", label: "2–3 working days" },
    { code: "4_7_days", label: "4–7 working days" },
  ],
  checkYourProducts: { actions: [], unpricedItemIds: [] },
});

beforeEach(() => {
  jest.clearAllMocks();
  (loadTemplateCatalogue as jest.Mock).mockResolvedValue({ status: "ok", value: catalogue });
  (previewTemplateProduct as jest.Mock).mockResolvedValue({
    status: "ok",
    value: { listing: null, readyBy: { earliestReadyBy: new Date("2026-11-25T07:00:00.000Z"), securedReadyBy: null, days: [] } },
  });
  (addTemplateProduct as jest.Mock).mockResolvedValue({
    status: "ok",
    value: { id: "sci_new", name: "Flyers", photos: [] },
  });
});

async function tickFlyersAndOpenPrices() {
  await fireEvent.press(await screen.findByTestId("template-tile-tpl_flyers"));
  await fireEvent.press(screen.getByLabelText("Next: prices"));
  expect(await screen.findByText("Prices for Flyers")).toBeTruthy();
}

describe("adding a GRIDGO product in three screens", () => {
  it("hands over to today's builder when GRIDGO has no templates yet", async () => {
    (loadTemplateCatalogue as jest.Mock).mockResolvedValue({ status: "not_open_yet" });
    const view = await render(<AddProductScreen />);
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/shop/new"));
    await view.unmount();
  });

  it("marks products already added and opens them instead of adding twice", async () => {
    const view = await render(<AddProductScreen />);
    expect(await screen.findByText("Added — tap to open")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("template-tile-tpl_business_cards"));
    expect(router.push).toHaveBeenCalledWith("/shop/product/sci_cards");
    await view.unmount();
  });

  it("sends a product outside the shop's services to Services, not into the flow", async () => {
    const view = await render(<AddProductScreen />);
    expect(await screen.findByText("Add this service first")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("template-tile-tpl_drinkware"));
    expect(askConfirm).toHaveBeenCalled();
    expect(screen.getByText("What do you make?")).toBeTruthy();
    await view.unmount();
  });

  it("asks for a tick before prices", async () => {
    const view = await render(<AddProductScreen />);
    await screen.findByTestId("template-tile-tpl_flyers");
    await fireEvent.press(screen.getByLabelText("Next: prices"));
    expect(screen.getByText("Tick at least one product you make.")).toBeTruthy();
    expect(screen.queryByText("Prices for Flyers")).toBeNull();
    await view.unmount();
  });

  it("blocks an empty or ₱0 price and says which row to fix", async () => {
    const view = await render(<AddProductScreen />);
    await tickFlyersAndOpenPrices();

    await fireEvent.press(screen.getByLabelText("I make A5 / Glossy"));
    await fireEvent.changeText(screen.getByLabelText("Full price for A5 / Glossy, per piece"), "0");
    await fireEvent.press(screen.getByLabelText("Next: ready time"));

    expect(screen.getByText("One ticked option needs a price above ₱0.")).toBeTruthy();
    expect(screen.getByText("Enter a price above ₱0, or untick it.")).toBeTruthy();
    expect(screen.queryByText("When is it ready?")).toBeNull();
    await view.unmount();
  });

  it("adds a product end to end: tick, full prices, a ready-time chip, save", async () => {
    const view = await render(<AddProductScreen />);
    await tickFlyersAndOpenPrices();

    await fireEvent.press(screen.getByLabelText("I make A5 / Glossy"));
    await fireEvent.changeText(screen.getByLabelText("Full price for A5 / Glossy, per piece"), "12");
    await fireEvent.press(screen.getByLabelText("I make A4 / Glossy"));
    await fireEvent.changeText(screen.getByLabelText("Full price for A4 / Glossy, per piece"), "20.50");
    // The client-sees bar follows the table.
    expect(screen.getByText("From ₱12.00 per piece")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Next: ready time"));

    expect(await screen.findByText("When is it ready?")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("ready-chip-next_day"));
    expect(await screen.findByText("Ordered now, ready by Wed 25 Nov, 3:00 PM")).toBeTruthy();
    expect(screen.getByText("Ready: next working day")).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Save product"));

    await waitFor(() =>
      expect(addTemplateProduct).toHaveBeenCalledWith({
        templateId: "tpl_flyers",
        supplierServiceId: "svc_marketing",
        readyTime: "next_day",
        prices: [
          { optionKey: "standard", priceMinor: 1200 },
          { optionKey: "variant_1", priceMinor: 2050 },
        ],
        minimumOrderQuantity: null,
        priceTiers: [],
        speedTiers: [],
      }),
    );
    expect(await screen.findByText("Flyers is saved")).toBeTruthy();
    expect(screen.getByText(/checks the prices today/)).toBeTruthy();
    await view.unmount();
  });

  it("folds More options until asked, and refuses a half-filled one by name", async () => {
    const view = await render(<AddProductScreen />);
    await tickFlyersAndOpenPrices();
    await fireEvent.press(screen.getByLabelText("I make A5 / Glossy"));
    await fireEvent.changeText(screen.getByLabelText("Full price for A5 / Glossy, per piece"), "12");
    await fireEvent.press(screen.getByLabelText("Next: ready time"));
    await fireEvent.press(await screen.findByTestId("ready-chip-same_day"));

    expect(screen.queryByLabelText("Minimum order")).toBeNull();
    await fireEvent.press(screen.getByTestId("more-options-toggle"));
    await fireEvent.changeText(screen.getByLabelText("Bulk discount starts at, pieces"), "100");
    await fireEvent.press(screen.getByLabelText("Save product"));

    expect(screen.getByText("Bulk discount: enter the price each, above ₱0.")).toBeTruthy();
    expect(addTemplateProduct).not.toHaveBeenCalled();

    await fireEvent.changeText(screen.getByLabelText("Bulk price each"), "9");
    await fireEvent.press(screen.getByLabelText("Save product"));
    await waitFor(() =>
      expect(addTemplateProduct).toHaveBeenCalledWith(
        expect.objectContaining({ readyTime: "same_day", priceTiers: [{ minQuantity: 100, unitPriceMinor: 900 }] }),
      ),
    );
    await view.unmount();
  });

  it("says what GRIDGO refused and keeps the shop's prices", async () => {
    (addTemplateProduct as jest.Mock).mockResolvedValue({
      status: "failed",
      message: "You already have this product. Open it from Products to change its prices.",
    });
    const view = await render(<AddProductScreen />);
    await tickFlyersAndOpenPrices();
    await fireEvent.press(screen.getByLabelText("I make A5 / Glossy"));
    await fireEvent.changeText(screen.getByLabelText("Full price for A5 / Glossy, per piece"), "12");
    await fireEvent.press(screen.getByLabelText("Next: ready time"));
    await fireEvent.press(await screen.findByTestId("ready-chip-same_day"));
    await fireEvent.press(screen.getByLabelText("Save product"));
    expect(await screen.findByText("You already have this product. Open it from Products to change its prices.")).toBeTruthy();
    expect(screen.getByText("When is it ready?")).toBeTruthy();
    await view.unmount();
  });

  it("never dead-ends: ask GRIDGO, build it yourself, or let GRIDGO set it up", async () => {
    const view = await render(<AddProductScreen />);
    await screen.findByTestId("not-in-list");
    await fireEvent.press(screen.getByText("Ask GRIDGO to add it"));
    expect(router.push).toHaveBeenCalledWith("/shop/ask-template");
    await fireEvent.press(screen.getByText("Make a custom product"));
    expect(router.push).toHaveBeenCalledWith("/shop/new");
    await fireEvent.press(screen.getByTestId("setup-help-row"));
    expect(router.push).toHaveBeenCalledWith("/shop/setup-help");
    await view.unmount();
  });

  it("asks GRIDGO for the search and the group, not the phone", async () => {
    const view = await render(<AddProductScreen />);
    await screen.findByTestId("template-tile-tpl_flyers");
    await fireEvent.press(screen.getByText("Gifts"));
    await waitFor(() => expect(loadTemplateCatalogue).toHaveBeenLastCalledWith({ q: "", group: "gifts" }));
    await view.unmount();
  });
});
