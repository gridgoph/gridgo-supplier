import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import ServiceCategoryScreen from "@/app/services/[category]";
import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";

const mockNavigation = { setOptions: jest.fn() };
jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({ category: "print" }),
  useNavigation: () => mockNavigation,
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getTaxonomy: jest.fn(async () => ({
    categories: [{ code: "print", name: "Print" }],
    subcategories: [{ code: "cards", name: "Cards", categoryCode: "print" }],
    materials: [
      { code: "paper", name: "Paper", categoryCodes: ["print"] },
      { code: "vinyl", name: "Vinyl", categoryCodes: ["print"] },
    ],
    finishes: [{ code: "laminate", name: "Lamination", categoryCodes: ["print"] }],
  })),
  listSupplierServices: jest.fn(), updateSupplierService: jest.fn(async () => ({})),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));

const line = { id: "svc", categoryCode: "print", state: "live", materialCodes: ["paper"], finishCodes: [] } as unknown as api.SupplierService;

it("adopts untouched finishes during an edit and saves only the local material change", async () => {
  (api.listSupplierServices as jest.Mock).mockResolvedValue([line]);
  const view = await render(<ServiceCategoryScreen />);
  await screen.findByLabelText("Vinyl");
  let receive!: (lines: api.SupplierService[]) => void;
  (api.listSupplierServices as jest.Mock).mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }));
  await act(async () => { invalidate("services"); });
  await waitFor(() => expect(api.listSupplierServices).toHaveBeenCalledTimes(2));
  await fireEvent.press(screen.getByLabelText("Vinyl"));
  await act(async () => { receive([{ ...line, finishCodes: ["laminate"] }]); });
  expect(screen.getByLabelText("Lamination").props.accessibilityState.checked).toBe(true);
  expect(screen.getByLabelText("Vinyl").props.accessibilityState.checked).toBe(true);
  await fireEvent.press(screen.getByLabelText("Save what you can produce"));
  await waitFor(() => expect(api.updateSupplierService).toHaveBeenCalledWith("svc", { materialCodes: ["paper", "vinyl"] }));
  await view.unmount();
});
