import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";

import HandoffScreen from "@/app/job/[id]/handoff";
import JobWorkspaceScreen from "@/app/job/[id]/index";
import * as api from "@/lib/api";
import { askConfirm } from "@/store/sheets";
import { useToasts } from "@/store/toasts";

const mockRun = jest.fn();
let mockJob: Partial<api.Order>;

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), push: jest.fn(), navigate: jest.fn() },
  useLocalSearchParams: () => ({ id: "job" }),
  useNavigation: () => ({ setOptions: jest.fn() }),
  useFocusEffect: (callback: () => void) => {
    const { useEffect } = jest.requireActual<typeof import("react")>("react");
    useEffect(callback, [callback]);
  },
}));
jest.mock("@/hooks/useJob", () => ({
  useJob: () => ({ job: mockJob, loading: false, error: null, reload: jest.fn() }),
}));
jest.mock("@/hooks/useJobAction", () => ({
  useJobAction: () => ({ busy: false, run: mockRun, error: null, failure: null, missing: [], clearError: jest.fn() }),
}));
jest.mock("@/hooks/useFileUpload", () => ({
  useFileUpload: () => ({ items: [], busy: false, markAttached: jest.fn(), retry: jest.fn(), remove: jest.fn() }),
}));
jest.mock("@/hooks/useProductionLapses", () => ({
  useProductionLapses: () => ({ lapses: [], reload: jest.fn() }),
}));
jest.mock("@/hooks/useOrderCalls", () => ({ useOrderCalls: () => [] }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getOperatingStatus: jest.fn(),
}));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
jest.mock("@/components/ProgressPhotoStrip", () => ({ ProgressPhotoStrip: () => null }));
jest.mock("@/components/PushEnableCard", () => ({ PushEnableCard: () => null }));

const LINE = "Riders can pick this up from 8:00 AM tomorrow.";
const getStatus = api.getOperatingStatus as jest.Mock;
const confirm = askConfirm as jest.Mock;

const base: Partial<api.Order> = {
  id: "job",
  title: "Print job",
  quantity: 100,
  payoutMilestones: [],
  riderId: null,
};
/** Everything the older handover wants is on the job, so "Ready for dispatch" is offered. */
const packed: Partial<api.Order> = {
  ...base,
  state: "supplier_self_qc",
  productionProgress: { status: "photos_available", photos: [] },
  packingProgress: { status: "photos_available", photos: [] },
} as Partial<api.Order>;
const waiting: Partial<api.Order> = { ...base, state: "ready_for_dispatch" };

function closed() {
  // 5:28 PM Wednesday in Manila, opening 8:00 AM Thursday.
  jest.setSystemTime(new Date("2026-11-04T09:28:00.000Z"));
  getStatus.mockResolvedValue({ isOpenNow: false, scheduledReviewAt: "2026-11-05T00:00:00.000Z" });
}
function open() {
  jest.setSystemTime(new Date("2026-11-04T03:00:00.000Z"));
  getStatus.mockResolvedValue({ isOpenNow: true, scheduledReviewAt: "2026-11-04T03:00:00.000Z" });
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
  useToasts.getState().clear();
  mockRun.mockImplementation(async () => ({ ...packed, state: "ready_for_dispatch" }));
});
afterEach(() => {
  jest.useRealTimers();
});

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("marking a job ready", () => {
  it("after closing: says when riders can pick it up, before and after", async () => {
    closed();
    mockJob = packed;
    await render(<HandoffScreen />);
    await settle();

    await fireEvent.press(screen.getByLabelText("Ready for dispatch"));
    await settle();

    expect(confirm.mock.calls[0][0].consequence).toContain(LINE);
    expect(confirm.mock.calls[0][0].consequence).not.toContain("notified");
    await waitFor(() => expect(useToasts.getState().toasts).toHaveLength(1));
    expect(useToasts.getState().toasts[0]).toMatchObject({ title: "Ready for pickup", body: LINE, orderId: "job" });
  });

  it("after closing: is the same step, allowed and sent the same way", async () => {
    closed();
    mockJob = packed;
    await render(<HandoffScreen />);
    await settle();

    await fireEvent.press(screen.getByLabelText("Ready for dispatch"));
    await settle();

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(mockRun.mock.calls[0][0]).toMatchObject({ jobId: "job", targetState: "ready_for_dispatch" });
    expect(router.replace).toHaveBeenCalledWith({ pathname: "/job/[id]", params: { id: "job" } });
  });

  it("while open: nothing new", async () => {
    open();
    mockJob = packed;
    await render(<HandoffScreen />);
    await settle();

    await fireEvent.press(screen.getByLabelText("Ready for dispatch"));
    await settle();

    expect(confirm.mock.calls[0][0].consequence).toContain("Riders will be notified");
    expect(mockRun).toHaveBeenCalledTimes(1);
    await settle();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("when GRIDGO will not say: nothing new, and the step still goes through", async () => {
    jest.setSystemTime(new Date("2026-11-04T09:28:00.000Z"));
    getStatus.mockRejectedValue(new Error("offline"));
    mockJob = packed;
    await render(<HandoffScreen />);
    await settle();

    await fireEvent.press(screen.getByLabelText("Ready for dispatch"));
    await settle();

    expect(mockRun).toHaveBeenCalledTimes(1);
    expect(useToasts.getState().toasts).toHaveLength(0);
  });

  it("does not toast when the step was refused", async () => {
    closed();
    mockJob = packed;
    mockRun.mockResolvedValue(null);
    await render(<HandoffScreen />);
    await settle();

    await fireEvent.press(screen.getByLabelText("Ready for dispatch"));
    await settle();

    expect(router.replace).not.toHaveBeenCalled();
    expect(useToasts.getState().toasts).toHaveLength(0);
  });
});

describe("the job's own screen", () => {
  it("while closed and waiting: draws the notice in place of 'Riders have been notified'", async () => {
    closed();
    mockJob = waiting;
    await render(<JobWorkspaceScreen />);
    await settle();

    expect(await screen.findByText("Dispatch is closed")).toBeTruthy();
    expect(screen.getByText(LINE)).toBeTruthy();
    expect(screen.queryByText(/Riders have been notified/)).toBeNull();
    expect(screen.getByText(/Keep the package at the counter/)).toBeTruthy();
  });

  it("goes away at the opening itself", async () => {
    closed();
    mockJob = waiting;
    await render(<JobWorkspaceScreen />);
    await settle();
    expect(await screen.findByText(LINE)).toBeTruthy();

    getStatus.mockResolvedValue({ isOpenNow: true, scheduledReviewAt: "2026-11-05T00:00:00.000Z" });
    await act(async () => {
      jest.advanceTimersByTime(15 * 60 * 60 * 1000);
      await Promise.resolve();
    });
    await settle();

    expect(screen.queryByText("Dispatch is closed")).toBeNull();
  });

  it("while open: nothing new", async () => {
    open();
    mockJob = waiting;
    await render(<JobWorkspaceScreen />);
    await settle();

    expect(screen.queryByText("Dispatch is closed")).toBeNull();
    expect(screen.getByText("Waiting on a rider")).toBeTruthy();
  });

  it("with a rider on it: no notice, and no read", async () => {
    closed();
    mockJob = { ...base, state: "rider_assigned", riderId: "rider" };
    await render(<JobWorkspaceScreen />);
    await settle();

    expect(getStatus).not.toHaveBeenCalled();
    expect(screen.queryByText("Dispatch is closed")).toBeNull();
  });

  it("before it is ready: no notice, and no read", async () => {
    closed();
    mockJob = { ...base, state: "production" };
    await render(<JobWorkspaceScreen />);
    await settle();

    expect(getStatus).not.toHaveBeenCalled();
    expect(screen.queryByText("Dispatch is closed")).toBeNull();
  });
});

describe("the handoff screen, while the job waits", () => {
  it("closed: leads with the opening", async () => {
    closed();
    mockJob = waiting;
    await render(<HandoffScreen />);
    await settle();

    expect(await screen.findByText(`Dispatch is closed. ${LINE}`)).toBeTruthy();
    expect(screen.queryByText(/Riders have been notified/)).toBeNull();
  });

  it("open: as before", async () => {
    open();
    mockJob = waiting;
    await render(<HandoffScreen />);
    await settle();

    expect(screen.queryByText(/Dispatch is closed/)).toBeNull();
    expect(screen.getAllByText(/Riders have been notified/).length).toBeGreaterThan(0);
  });
});
