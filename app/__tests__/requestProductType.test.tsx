import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ name: "Keychains" }),
}));

jest.mock("@/hooks/useBoard", () => ({
  useBoard: jest.fn(),
}));

jest.mock("@/lib/listingsApi", () => ({
  ...jest.requireActual("@/lib/listingsApi"),
  loadProductTypeRequests: jest.fn(),
  requestProductType: jest.fn(),
}));

import RequestProductTypeScreen from "@/app/shop/request-type";
import { useBoard } from "@/hooks/useBoard";
import { loadProductTypeRequests, requestProductType } from "@/lib/listingsApi";
import type { ServiceCatalog } from "@/lib/taxonomy";

const catalog: ServiceCatalog = {
  source: "platform",
  canDeclare: true,
  aliases: {},
  categories: [
    {
      code: "corporate_event_merch",
      name: "Corporate & event merch",
      bestFor: "",
      declarable: true,
      materials: [],
      finishes: [],
      covers: [{ code: "pins", name: "Pins", examples: "" }],
    },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  (useBoard as jest.Mock).mockReturnValue({
    catalog,
    services: [
      { id: "svc_1", categoryCode: "corporate_event_merch", state: "live", turnaroundHours: 24, formatCodes: [] },
    ],
    loading: false,
    notOpenYet: false,
    error: null,
    reload: jest.fn(),
  });
  (loadProductTypeRequests as jest.Mock).mockResolvedValue({
    status: "ok",
    value: [
      {
        id: "ptr_1",
        categoryCode: "corporate_event_merch",
        name: "Enamel pins",
        description: "Soft enamel",
        status: "needs_revision",
        reason: "Say which machine you use",
        createdAt: "2026-10-01T00:00:00Z",
      },
    ],
  });
});

it("sends a request under the shop's only category, with what it searched for already typed", async () => {
  (requestProductType as jest.Mock).mockResolvedValue({
    status: "ok",
    value: {
      id: "ptr_2",
      categoryCode: "corporate_event_merch",
      name: "Keychains",
      description: "Laser-cut acrylic",
      status: "pending",
      reason: null,
      createdAt: "2026-10-05T00:00:00Z",
    },
  });

  await render(<RequestProductTypeScreen />);

  expect(screen.getByLabelText("Product type").props.value).toBe("Keychains");
  expect(screen.getByText("Corporate & event merch")).toBeTruthy();
  await fireEvent.changeText(screen.getByLabelText("What it is and how you make it"), "Laser-cut acrylic");
  await fireEvent.press(screen.getByRole("button", { name: "Send request" }));

  await waitFor(() =>
    expect(requestProductType).toHaveBeenCalledWith({
      categoryCode: "corporate_event_merch",
      name: "Keychains",
      description: "Laser-cut acrylic",
    }),
  );
  expect(await screen.findByText("Request sent for “Keychains”")).toBeTruthy();
});

it("will not send without a description, and says what is missing", async () => {
  await render(<RequestProductTypeScreen />);

  await fireEvent.press(screen.getByRole("button", { name: "Send request" }));

  expect(requestProductType).not.toHaveBeenCalled();
  expect(screen.getByText("Say what it is and how you make it.")).toBeTruthy();
});

it("lists the shop's earlier requests with Operations' reason", async () => {
  await render(<RequestProductTypeScreen />);

  expect(await screen.findByText("Enamel pins")).toBeTruthy();
  expect(screen.getByText("Needs changes")).toBeTruthy();
  expect(screen.getByText("Reason: Say which machine you use")).toBeTruthy();
});
