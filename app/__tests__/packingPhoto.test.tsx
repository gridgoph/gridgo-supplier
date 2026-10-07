import { fireEvent, render, screen } from "@testing-library/react-native";
import HandoffScreen from "@/app/job/[id]/handoff";
import * as api from "@/lib/api";
import { askConfirm } from "@/store/sheets";
import type { UploadItem } from "@/lib/files";
const mockReload = jest.fn();
const mockRun = jest.fn();
const mockMarkAttached = jest.fn();
let mockJob: Partial<api.Order>;
let mockItems: UploadItem[];
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: "job" }),
  useFocusEffect: () => {},
}));
jest.mock("@/hooks/useJob", () => ({
  useJob: () => ({
    job: mockJob,
    loading: false,
    error: null,
    reload: mockReload,
  }),
}));
jest.mock("@/hooks/useJobAction", () => ({
  useJobAction: () => ({
    busy: false,
    run: mockRun,
    error: null,
    failure: null,
  }),
}));
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => ({
    items: mockItems,
    busy: false,
    markAttached: mockMarkAttached,
    retry: jest.fn(),
    remove: jest.fn(),
    takePhoto: jest.fn(),
    pickImage: jest.fn(),
  }),
}));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  attachPackingPhoto: jest.fn(async () => ({})),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
jest.mock("@/components/ProgressPhotoStrip", () => ({
  ProgressPhotoStrip: () => null,
}));
beforeEach(() => {
  jest.clearAllMocks();
  mockJob = {
    id: "job",
    title: "Print job",
    state: "production",
    quantity: 100,
    productionProgress: { status: "photos_available", photos: [] },
    packingProgress: { status: "waiting_for_photo", photos: [] },
    payoutMilestones: [],
  };
  mockItems = [];
});
it("shows the packing step instead of dispatch until a photo is attached", async () => {
  const view = await render(<HandoffScreen />);
  expect(screen.getByText("Packed")).toBeTruthy();
  expect(screen.getByLabelText("Take a packing photo")).toBeTruthy();
  expect(screen.queryByLabelText("Ready for dispatch")).toBeNull();
  expect(mockRun).not.toHaveBeenCalled();
  await view.unmount();
});
it("confirms then attaches stored evidence without transitioning or paying", async () => {
  mockItems = [
    {
      key: "photo",
      fileId: "packed",
      fileName: "packed.jpg",
      mimeType: "image/jpeg",
      uri: "file:///packed.jpg",
      sizeBytes: 100,
      stage: "stored",
      progress: 1,
      error: null,
    },
  ];
  const view = await render(<HandoffScreen />);
  await fireEvent.press(screen.getByLabelText("Send packing photo"));
  expect(askConfirm).toHaveBeenCalledWith(
    expect.objectContaining({ confirmLabel: "Send packing photo" }),
  );
  expect(api.attachPackingPhoto).toHaveBeenCalledWith("packed", "job");
  expect(mockMarkAttached).toHaveBeenCalledWith("photo");
  expect(mockReload).toHaveBeenCalled();
  expect(mockRun).not.toHaveBeenCalled();
  await view.unmount();
});
it("leaves an upload unattached when confirmation is cancelled", async () => {
  (askConfirm as jest.Mock).mockResolvedValueOnce(false);
  mockItems = [
    {
      key: "photo",
      fileId: "packed",
      fileName: "packed.jpg",
      mimeType: "image/jpeg",
      uri: "file:///packed.jpg",
      sizeBytes: 100,
      stage: "stored",
      progress: 1,
      error: null,
    },
  ];
  const view = await render(<HandoffScreen />);
  await fireEvent.press(screen.getByLabelText("Send packing photo"));
  expect(api.attachPackingPhoto).not.toHaveBeenCalled();
  await view.unmount();
});
it("offers dispatch after the server reports the packing photo", async () => {
  mockJob.packingProgress = {
    status: "photos_available",
    photos: [{ fileId: "packed", contentType: "image/jpeg" }],
  };
  const view = await render(<HandoffScreen />);
  expect(screen.getByLabelText("Ready for dispatch")).toBeTruthy();
  expect(screen.getByText("Packing photo sent")).toBeTruthy();
  await view.unmount();
});
