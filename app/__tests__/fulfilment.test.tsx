import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import FulfilmentProofScreen from "@/app/job/[id]/fulfilment";
import * as api from "@/lib/api";
import { invalidate } from "@/lib/live";
import type { UploadItem } from "@/lib/files";

jest.mock("expo-router", () => ({
  router: { back: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_1" }),
  useFocusEffect: (callback: () => void) => { jest.requireActual("react").useEffect(callback, [callback]); },
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"), getOrder: jest.fn(), attachFulfilmentProof: jest.fn(async () => ({})),
}));
jest.mock("@/lib/files", () => ({ ...jest.requireActual("@/lib/files"), probeStorage: jest.fn(async () => "available") }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
const mockFile: UploadItem = {
  key: "photo", fileId: "file_1", fileName: "packing.jpg", mimeType: "image/jpeg",
  uri: "file:///packing.jpg", sizeBytes: 100, stage: "stored", progress: 1, error: null,
};
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ items: [mockFile], busy: false, markAttached: jest.fn(), retry: jest.fn(), remove: jest.fn() }),
}));

it("keeps the filed milestone and photo when no shop proof remains", async () => {
  const job = {
    id: "ord_1", title: "Print job", state: "ready_for_dispatch", timeline: [],
    supplierPriceMinor: 100000,
    payoutMilestones: [
      { code: "printing", sharePercent: 50, amountMinor: 50000, status: "pof_attached", pofFileIds: ["print"], releasedAt: null },
      { code: "packaging_qc", sharePercent: 15, amountMinor: 15000, status: "pending_pof", pofFileIds: [], releasedAt: null },
    ],
  } as api.Order;
  (api.getOrder as jest.Mock).mockResolvedValue(job);
  const view = await render(<FulfilmentProofScreen />);
  await fireEvent.press(await screen.findByLabelText("File this evidence"));
  expect(await screen.findByText("Evidence filed")).toBeTruthy();
  expect(api.attachFulfilmentProof).toHaveBeenCalledWith("file_1", "ord_1", "packaging_qc");
  (api.getOrder as jest.Mock).mockResolvedValue({
    ...job, payoutMilestones: job.payoutMilestones!.map((part) => ({ ...part, status: "pof_attached", pofFileIds: ["file_1"] })),
  });
  await act(async () => { invalidate("orders"); });
  await waitFor(() => expect(api.getOrder).toHaveBeenCalledTimes(2));
  expect(screen.getByText("Evidence filed")).toBeTruthy();
  expect(screen.getByLabelText("packing.jpg").props.source).toEqual({ uri: "file:///packing.jpg" });
  await view.unmount();
});
