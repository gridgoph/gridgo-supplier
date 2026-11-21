import { fireEvent, render, screen } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "item_1" }),
}));

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getCatalogItem: jest.fn(),
  updateCatalogItem: jest.fn(),
  deleteCatalogItem: jest.fn(),
}));

jest.mock("@/store/sheets", () => ({
  ...jest.requireActual("@/store/sheets"),
  askConfirm: jest.fn(),
}));

import ProductActionsSheet from "@/app/product-actions";
import { deleteCatalogItem, getCatalogItem, updateCatalogItem } from "@/lib/api";
import { askConfirm } from "@/store/sheets";

/** An approved listing on the board, as GRIDGO sends it. */
function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "item_1",
    version: 3,
    name: "A3 prints",
    basePriceMinor: 1000,
    pricingUnit: "per_page",
    active: true,
    reviewStatus: "approved",
    hasApprovedVersion: true,
    photos: [],
    ...overrides,
  };
}

describe("a product's quick actions", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    (getCatalogItem as jest.Mock).mockResolvedValue(item());
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
  });

  it("hides it from clients, keeps its prices, and offers Undo", async () => {
    (updateCatalogItem as jest.Mock)
      .mockResolvedValueOnce(item({ active: false, version: 4 }))
      .mockResolvedValueOnce(item({ active: true, version: 5 }));
    view = await render(<ProductActionsSheet />);

    await fireEvent.press(await screen.findByRole("switch", { name: "Show to clients" }));

    expect(updateCatalogItem).toHaveBeenCalledWith("item_1", 3, { active: false });
    expect(await screen.findByText(/Your prices and ready time are kept/)).toBeTruthy();

    await fireEvent.press(screen.getByLabelText("Undo, show it to clients again"));
    expect(updateCatalogItem).toHaveBeenLastCalledWith("item_1", 4, { active: true });
    expect(await screen.findByText("Shown to clients again.")).toBeTruthy();
  });

  it("asks before removing, and removes nothing when the shop keeps it", async () => {
    (askConfirm as jest.Mock).mockResolvedValue(false);
    view = await render(<ProductActionsSheet />);

    await fireEvent.press(await screen.findByText("Remove product"));

    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        question: "Remove “A3 prints” from your shop?",
        consequence: expect.stringMatching(/Open orders for it still get finished/),
        destructive: true,
      }),
    );
    expect(deleteCatalogItem).not.toHaveBeenCalled();
  });

  it("removes it after the shop confirms, and says a kept one is archived", async () => {
    (askConfirm as jest.Mock).mockResolvedValue(true);
    (deleteCatalogItem as jest.Mock).mockResolvedValue(item({ active: false }));
    view = await render(<ProductActionsSheet />);

    await fireEvent.press(await screen.findByText("Remove product"));

    expect(deleteCatalogItem).toHaveBeenCalledWith("item_1", 3);
    expect(await screen.findByText(/Kept for a job already ordered/)).toBeTruthy();
    expect(screen.queryByText("Remove product")).toBeNull();
  });

  it("offers no switch for a listing GRIDGO took down", async () => {
    (getCatalogItem as jest.Mock).mockResolvedValue(item({ suspendReason: "Wrong photos" }));
    view = await render(<ProductActionsSheet />);

    expect(await screen.findByText(/Only GRIDGO can put it back/)).toBeTruthy();
    expect(screen.queryByRole("switch", { name: "Show to clients" })).toBeNull();
  });

  it("reloads a product another phone changed, and removes only after a fresh confirm", async () => {
    const { ApiError } = jest.requireActual("@/lib/api");
    (askConfirm as jest.Mock).mockResolvedValue(true);
    (getCatalogItem as jest.Mock).mockResolvedValueOnce(item()).mockResolvedValue(item({ version: 4 }));
    (deleteCatalogItem as jest.Mock)
      .mockRejectedValueOnce(new ApiError(409, { error: "catalog_item_stale" }))
      .mockResolvedValueOnce(null);
    view = await render(<ProductActionsSheet />);

    await fireEvent.press(await screen.findByText("Remove product"));

    expect(deleteCatalogItem).toHaveBeenCalledTimes(1);
    expect(getCatalogItem).toHaveBeenCalledTimes(2);
    expect(await screen.findByText(/changed on another screen or phone/)).toBeTruthy();

    await fireEvent.press(screen.getByText("Remove product"));
    expect(askConfirm).toHaveBeenCalledTimes(2);
    expect(deleteCatalogItem).toHaveBeenLastCalledWith("item_1", 4);
    expect(await screen.findByText("Removed from your shop.")).toBeTruthy();
  });
});

