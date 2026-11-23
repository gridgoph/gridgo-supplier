import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "sci_1" }),
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

jest.mock("@/lib/productTemplatesApi", () => ({
  loadTemplateCatalogue: jest.fn(),
  loadTemplateProduct: jest.fn(),
  loadReadyPreview: jest.fn(async () => ({ status: "ok", value: null })),
  saveTemplateProduct: jest.fn(),
  confirmTemplatePrices: jest.fn(),
  setLive: jest.fn(),
}));

import TemplateProductScreen from "@/app/shop/product/[id]";
import { normalizeListing } from "@/lib/listings";
import { normalizeCatalogue } from "@/lib/productTemplates";
import {
  confirmTemplatePrices,
  loadTemplateCatalogue,
  loadTemplateProduct,
  saveTemplateProduct,
  setLive,
} from "@/lib/productTemplatesApi";

const catalogue = normalizeCatalogue({
  templates: [
    {
      id: "tpl_flyers",
      name: "Flyers",
      description: "Flyers.",
      categoryCode: "marketing_print",
      subcategoryCode: "flyers",
      group: "marketing",
      unit: "piece",
      options: [
        { key: "standard", label: "A5 / Glossy" },
        { key: "variant_1", label: "A4 / Glossy" },
      ],
      stockPhotos: [{ url: "/product-template-photos/lst_flyers.jpg" }],
      clientTips: ["Send a clear, print-ready file."],
      machinesNeeded: [],
      addedItemIds: ["sci_1"],
    },
  ],
  readyTimes: [
    { code: "same_day", label: "Same day" },
    { code: "next_day", label: "Next working day" },
  ],
});

function product(template: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return normalizeListing({
    id: "sci_1",
    name: "Flyers",
    active: false,
    version: 3,
    reviewStatus: "pending",
    hasApprovedVersion: false,
    template: { templateId: "tpl_flyers", managed: true, readyTime: "next_day", ...template },
    ...extra,
  })!;
}

function answer(listing: ReturnType<typeof product>) {
  return { status: "ok", value: { listing, prices: [{ optionKey: "standard", priceMinor: 1500 }] } };
}

beforeEach(() => {
  jest.clearAllMocks();
  (loadTemplateCatalogue as jest.Mock).mockResolvedValue({ status: "ok", value: catalogue });
});

describe("a GRIDGO template product", () => {
  it("confirms prices the GRIDGO team prepared — nothing is live before that", async () => {
    const prepared = product({ shopConfirmed: false });
    (loadTemplateProduct as jest.Mock).mockResolvedValue(answer(prepared));
    (confirmTemplatePrices as jest.Mock).mockResolvedValue({ status: "ok", value: product({ shopConfirmed: true }, { active: true }) });

    const view = await render(<TemplateProductScreen />);
    expect(await screen.findByText("Prices to confirm")).toBeTruthy();
    // No Live switch until the shop confirms.
    expect(screen.queryByLabelText("Hidden")).toBeNull();
    expect(screen.getByDisplayValue("15")).toBeTruthy();

    (loadTemplateProduct as jest.Mock).mockResolvedValue(answer(product({ shopConfirmed: true }, { active: true })));
    await fireEvent.press(screen.getByLabelText("Confirm prices"));
    await waitFor(() => expect(confirmTemplatePrices).toHaveBeenCalledWith(prepared));
    expect(await screen.findByText(/Confirmed. The GRIDGO team checks the prices today/)).toBeTruthy();
    await view.unmount();
  });

  it("saves a corrected table as the confirmation, at full prices", async () => {
    (loadTemplateProduct as jest.Mock).mockResolvedValue(answer(product({ shopConfirmed: false })));
    (saveTemplateProduct as jest.Mock).mockResolvedValue({ status: "ok", value: product({ shopConfirmed: true }) });

    const view = await render(<TemplateProductScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Full price for A5 / Glossy, per piece"), "16");
    await fireEvent.press(screen.getByLabelText("Save and confirm"));
    await waitFor(() =>
      expect(saveTemplateProduct).toHaveBeenCalledWith(
        expect.objectContaining({ id: "sci_1" }),
        expect.objectContaining({ templateId: "tpl_flyers", readyTime: "next_day", prices: [{ optionKey: "standard", priceMinor: 1600 }] }),
      ),
    );
    await view.unmount();
  });

  it("will not save a ₱0 price", async () => {
    (loadTemplateProduct as jest.Mock).mockResolvedValue(answer(product({ shopConfirmed: true })));
    const view = await render(<TemplateProductScreen />);
    await fireEvent.changeText(await screen.findByLabelText("Full price for A5 / Glossy, per piece"), "0");
    await fireEvent.press(screen.getByLabelText("Save changes"));
    expect(screen.getByText("Enter a price above ₱0, or untick it.")).toBeTruthy();
    expect(saveTemplateProduct).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("draws no save action until something changed, and says a new price is for new orders only", async () => {
    (loadTemplateProduct as jest.Mock).mockResolvedValue(answer(product({ shopConfirmed: true })));
    const view = await render(<TemplateProductScreen />);
    expect(await screen.findByText(/A new price is for new orders only/)).toBeTruthy();
    expect(screen.queryByLabelText("Save changes")).toBeNull();
    await view.unmount();
  });

  it("hides and shows instantly, even while the price check is pending", async () => {
    const hidden = product({ shopConfirmed: true });
    (loadTemplateProduct as jest.Mock).mockResolvedValue(answer(hidden));
    (setLive as jest.Mock).mockResolvedValue({ status: "ok", value: product({ shopConfirmed: true }, { active: true }) });

    const view = await render(<TemplateProductScreen />);
    expect(await screen.findAllByText("Hidden")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Hidden"));
    await waitFor(() => expect(setLive).toHaveBeenCalledWith(hidden, true));
    expect(await screen.findByText("Live. Clients can order it.")).toBeTruthy();
    await view.unmount();
  });
});
