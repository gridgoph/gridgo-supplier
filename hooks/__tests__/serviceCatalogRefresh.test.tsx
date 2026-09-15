import { act, renderHook, waitFor } from "@testing-library/react-native";
import * as api from "@/lib/api";
import { useServiceCatalog } from "@/hooks/useServiceCatalog";

jest.mock("expo-router", () => ({
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getTaxonomy: jest.fn(async () => ({ categories: [], subcategories: [] })),
  listSupplierServices: jest.fn(),
}));

it("retains verified services when an older submitted response arrives last", async () => {
  let receive!: (lines: api.SupplierService[]) => void;
  const verified = { id: "svc", state: "live" } as api.SupplierService;
  (api.listSupplierServices as jest.Mock)
    .mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }))
    .mockResolvedValue([verified]);
  const { result } = await renderHook(() => useServiceCatalog());
  await act(async () => { await result.current.reload(); });
  await waitFor(() => expect(result.current.services).toEqual([verified]));
  await act(async () => { receive([{ ...verified, state: "pending_verification" }]); });
  expect(result.current.services).toEqual([verified]);
  expect(result.current.loading).toBe(false);
});
