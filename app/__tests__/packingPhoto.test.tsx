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
let mockActionError: string | null = null;
jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn() },
  useLocalSearchParams: () => ({ id: "job" }),
  useFocusEffect: () => {},
  useNavigation: () => ({ setOptions: jest.fn() }),
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
    error: mockActionError,
    failure: null,
    missing: [],
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
  mockActionError = null;
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

// Report 6C695C15: packaging refused with no reason.
it("holds the step and names the claim when only Operations can clear it", async () => {
  const claim =
    "This order cannot be packaged for pickup while a claim holds payouts. Operations must clear the claim first.";
  mockJob = {
    ...mockJob,
    packingProgress: { status: "photos_available", photos: [{ fileId: "packed", at: null }] },
    transitionReadiness: {
      ready_for_dispatch: { allowed: false, missing: [{ code: "claim_hold_active", message: claim }] },
    },
  };
  const view = await render(<HandoffScreen />);
  expect(screen.getByText(claim)).toBeTruthy();
  expect(screen.queryByLabelText("Ready for dispatch")).toBeNull();
  expect(screen.queryByLabelText("Take a packing photo")).toBeNull();
  expect(screen.getAllByText("Message Operations")).toHaveLength(1);
  await view.unmount();
});
it("does not repeat a refusal the checklist already says", async () => {
  const claim =
    "This order cannot be packaged for pickup while a claim holds payouts. Operations must clear the claim first.";
  mockActionError = claim;
  mockJob = {
    ...mockJob,
    packingProgress: { status: "photos_available", photos: [{ fileId: "packed", at: null }] },
    transitionReadiness: {
      ready_for_dispatch: { allowed: false, missing: [{ code: "claim_hold_active", message: claim }] },
    },
  };
  const view = await render(<HandoffScreen />);
  expect(screen.getAllByText(claim)).toHaveLength(1);
  await view.unmount();
});
it("says GRIDGO's own reason when it refuses the step", async () => {
  mockActionError = "Add a photo of the finished prints packed and ready before marking Ready for dispatch.";
  const view = await render(<HandoffScreen />);
  expect(screen.getByText(mockActionError)).toBeTruthy();
  expect(screen.queryByText(/would not accept this/)).toBeNull();
  await view.unmount();
});

// docs/SHOP_HANDOVER_API.md: on the newer handover nothing is packed before pickup.
describe("the newer handover", () => {
  const SENT = { at: "2026-10-15T02:00:00.000Z", supplierId: "shop", photoFileIds: ["f1"] };
  const APPROVED = { at: "2026-10-15T03:00:00.000Z", decision: "approved", note: "" };

  it("offers Ready for rider pickup once GRIDGO approved, with no packing photo", async () => {
    mockJob = {
      ...mockJob,
      supplierId: "shop",
      state: "supplier_self_qc",
      handoverFlow: "rider_packs",
      shopHandover: { finished: SENT, review: APPROVED },
      productionProgress: { status: "waiting_for_photo", photos: [] },
      packingProgress: { status: "waiting_for_photo", photos: [] },
      transitionReadiness: { ready_for_dispatch: { allowed: true, missing: [] } },
    };
    const view = await render(<HandoffScreen />);
    expect(screen.getAllByText("Ready for rider pickup").length).toBeGreaterThan(0);
    expect(screen.queryByLabelText("Take a packing photo")).toBeNull();
    expect(screen.queryByLabelText("Add a production photo")).toBeNull();
    // Said once, in the custody card; the lede leads with the situation.
    expect(screen.getByText("GRIDGO approved your finished products.")).toBeTruthy();
    expect(screen.getByTestId("handoff-instruction")).toBeTruthy();
    expect(screen.getAllByText(/Do not pack yet/)).toHaveLength(1);
    // What follows is folded, one tap away.
    expect(screen.queryByText("The rider checks the unpacked products")).toBeNull();
    await fireEvent.press(screen.getByLabelText("What happens next, 5 steps"));
    expect(screen.getByText("The rider checks the unpacked products")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Ready for rider pickup"));
    expect(askConfirm).toHaveBeenCalledWith(
      expect.objectContaining({
        confirmLabel: "Ready for rider pickup",
        consequence: expect.stringContaining("Prepare packing materials. Do not pack yet; the rider checks the unpacked items first."),
      }),
    );
    expect(mockRun).toHaveBeenCalledWith(expect.objectContaining({ targetState: "ready_for_dispatch" }));
    await view.unmount();
  });

  it("waits for a rider with one current instruction and nothing to press", async () => {
    mockJob = {
      ...mockJob,
      supplierId: "shop",
      state: "ready_for_dispatch",
      handoverFlow: "rider_packs",
      shopHandover: { finished: SENT, review: APPROVED },
    };
    const view = await render(<HandoffScreen />);
    expect(screen.getByText("Riders have been notified.")).toBeTruthy();
    expect(screen.getByText("Waiting for a rider")).toBeTruthy();
    expect(screen.getByTestId("handoff-instruction")).toBeTruthy();
    expect(
      screen.getAllByText("Prepare packing materials. Do not pack yet; the rider checks the unpacked items first."),
    ).toHaveLength(1);
    expect(screen.getByText("No invoice or receipt in the package")).toBeTruthy();
    // Custody moves at the rider's counter, never from here.
    expect(screen.queryByLabelText("Ready for rider pickup")).toBeNull();
    expect(screen.queryByLabelText("Take a packing photo")).toBeNull();
    await view.unmount();
  });

  it("sends a shop that has not sent its finished photos to that step", async () => {
    const finished = "Submit photos of the finished, unpacked products for GRIDGO review first.";
    mockJob = {
      ...mockJob,
      supplierId: "shop",
      handoverFlow: "rider_packs",
      shopHandover: {},
      transitionReadiness: {
        ready_for_dispatch: { allowed: false, missing: [{ code: "production_finished_required", message: finished }] },
      },
    };
    const view = await render(<HandoffScreen />);
    expect(screen.getByText("BEFORE YOU CALL A RIDER")).toBeTruthy();
    expect(screen.getByText(finished)).toBeTruthy();
    expect(screen.queryByLabelText("Ready for rider pickup")).toBeNull();
    await fireEvent.press(screen.getByLabelText("Send finished photos"));
    expect(mockRun).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("walks the counter: pack in front of the rider once the unpacked check passed", async () => {
    mockJob = {
      ...mockJob,
      supplierId: "shop",
      riderId: "rider",
      state: "rider_assigned",
      handoverFlow: "rider_packs",
      shopHandover: {},
      pickupChecklist: { status: "inspected", inspectionId: "i1", completedAt: "2026-10-15T05:00:00.000Z" },
    };
    const view = await render(<HandoffScreen />);
    expect(screen.getByTestId("rider-packing")).toBeTruthy();
    expect(screen.getByText("Pack it now, in front of the rider")).toBeTruthy();
    expect(screen.getByLabelText(/Step 1 of 3, The rider checks the unpacked products. Done/)).toBeTruthy();
    expect(screen.getByLabelText(/Step 2 of 3, You pack it in front of the rider. Now/)).toBeTruthy();
    expect(screen.queryByLabelText("Ready for dispatch")).toBeNull();
    await view.unmount();
  });

  it("names a step GRIDGO forced, with its reason", async () => {
    mockJob = {
      ...mockJob,
      supplierId: "shop",
      state: "ready_for_dispatch",
      handoverFlow: "rider_packs",
      forcedByGridgo: true,
      forcedSteps: [
        {
          at: "2026-10-15T06:00:00.000Z",
          from: "production",
          to: "ready_for_dispatch",
          reasonCode: "technical_issue",
          note: "Upload outage",
          skippedChecks: ["production_finished_required"],
        },
      ],
    };
    const view = await render(<HandoffScreen />);
    expect(screen.getByText("Forced by GRIDGO")).toBeTruthy();
    expect(screen.getByText("“Upload outage”")).toBeTruthy();
    expect(screen.getByText("Skipped: Finished-product photos")).toBeTruthy();
    await view.unmount();
  });
});
