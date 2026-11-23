import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn() },
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = require("react");
    useEffect(callback, [callback]);
  },
}));

jest.mock("@/lib/listingsApi", () => ({
  loadListing: jest.fn(),
}));

jest.mock("@/lib/productTemplatesApi", () => ({
  loadTemplateCatalogue: jest.fn(),
}));

import { CheckProductsCard } from "@/components/myshop/CheckProductsCard";
import { useCheckProducts } from "@/hooks/useCheckProducts";
import { normalizeListing } from "@/lib/listings";
import { loadListing } from "@/lib/listingsApi";
import { templateAlertHref } from "@/lib/listingReview";
import { loadTemplateCatalogue } from "@/lib/productTemplatesApi";
import { router } from "expo-router";

function Card() {
  const { check } = useCheckProducts();
  return <CheckProductsCard check={check} />;
}

const managed = (id: string, template: Record<string, unknown>) => ({
  id,
  name: id,
  active: false,
  template: { templateId: "tpl_flyers", managed: true, shopConfirmed: true, ...template },
});

beforeEach(() => jest.clearAllMocks());

describe("Check your products on My shop", () => {
  it("is not drawn on a GRIDGO without templates", async () => {
    (loadTemplateCatalogue as jest.Mock).mockResolvedValue({ status: "not_open_yet" });
    const view = await render(<Card />);
    expect(screen.queryByTestId("check-products-card")).toBeNull();
    expect(loadListing).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("is not drawn when every product has its prices", async () => {
    (loadTemplateCatalogue as jest.Mock).mockResolvedValue({
      status: "ok",
      value: { templates: [{ id: "tpl_flyers", addedItemIds: ["sci_ok"] }], readyTimes: [], check: { unpricedItemIds: [], suggestedCount: 0 } },
    });
    (loadListing as jest.Mock).mockResolvedValue({ status: "ok", value: normalizeListing(managed("sci_ok", {})) });
    const view = await render(<Card />);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.queryByTestId("check-products-card")).toBeNull();
    await view.unmount();
  });

  it("reads the products GRIDGO names and counts those needing a price or a confirmation", async () => {
    (loadTemplateCatalogue as jest.Mock).mockResolvedValue({
      status: "ok",
      value: {
        templates: [{ id: "tpl_flyers", addedItemIds: ["sci_prepared", "sci_ok"] }],
        readyTimes: [],
        check: { unpricedItemIds: ["sci_far"], suggestedCount: 1 },
      },
    });
    const rows: Record<string, unknown> = {
      sci_far: managed("sci_far", { needsPrice: true }),
      sci_prepared: managed("sci_prepared", { shopConfirmed: false }),
      sci_ok: managed("sci_ok", {}),
    };
    (loadListing as jest.Mock).mockImplementation(async (id: string) => ({ status: "ok", value: normalizeListing(rows[id]) }));

    const view = await render(<Card />);
    expect(await screen.findByText("Check your products")).toBeTruthy();
    expect(screen.getByText("1 needs a price, 1 with prices from GRIDGO to confirm. Hidden from clients until you do.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("check-products-card"));
    expect(router.push).toHaveBeenCalledWith("/shop/check-products");
    await view.unmount();
  });
});

describe("template notices", () => {
  it("open the screen that answers them", () => {
    expect(templateAlertHref("template_product_confirmation_required")).toBe("/shop/check-products");
    expect(templateAlertHref("template_product_live")).toBe("/(tabs)/catalogues");
    expect(templateAlertHref("template_request_completed")).toBe("/shop/add");
    expect(templateAlertHref("product_setup_updated")).toBe("/shop/setup-help");
    expect(templateAlertHref("order_accepted")).toBeNull();
  });
});
