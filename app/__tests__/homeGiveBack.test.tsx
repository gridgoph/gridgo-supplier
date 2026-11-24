import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import type { Order } from "@/lib/api";

let mockJob: Order | null = null;

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), navigate: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ id: "ord_home" }),
}));
jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock("@/hooks/useJob", () => ({
  useJob: () => ({ job: mockJob, loading: false, error: null, reload: jest.fn() }),
}));
jest.mock("@/hooks/useLastExpressJob", () => ({ useLastExpressJob: (job: unknown) => job }));
jest.mock("@/store/sheets", () => ({ askConfirm: jest.fn(async () => true) }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  giveBackExpress: jest.fn(async () => undefined),
  getHomePrinter: jest.fn(async () => ({})),
}));

import GiveBackScreen from "@/app/job/[id]/give-back";
import { giveBackExpress } from "@/lib/api";
import { askConfirm } from "@/store/sheets";

function job(acceptedAgoMs: number, state = "production"): Order {
  return {
    id: "ord_home",
    title: "Express documents",
    state,
    orderType: "express",
    shopAcceptance: {
      assignedAt: new Date(Date.now() - acceptedAgoMs - 60_000).toISOString(),
      deadlineAt: new Date(Date.now() + 60_000).toISOString(),
      workingMinutes: 5,
      status: "accepted",
      acceptedAt: new Date(Date.now() - acceptedAgoMs).toISOString(),
    },
    timeline: [],
  } as unknown as Order;
}

beforeEach(() => jest.clearAllMocks());

it("says it is free inside the first minutes, needs a reason, and hands it on", async () => {
  mockJob = job(60_000);
  await render(<GiveBackScreen />);
  expect(screen.getByText(/^Free until /)).toBeTruthy();
  expect(screen.getByText("Giving it back now costs nothing.")).toBeTruthy();

  await fireEvent.press(screen.getByRole("button", { name: /Give it back/ }));
  expect(screen.getByText("Pick the reason that fits closest.")).toBeTruthy();
  expect(giveBackExpress).not.toHaveBeenCalled();

  await fireEvent.press(screen.getByText("I ran out of paper or ink"));
  await fireEvent.press(screen.getByRole("button", { name: /Give it back/ }));
  await waitFor(() => expect(giveBackExpress).toHaveBeenCalledWith("ord_home", "I ran out of paper or ink"));
  expect((askConfirm as jest.Mock).mock.calls[0][0].consequence).toMatch(/This one is free/);
  expect(await screen.findByText("It was within the free time, so nothing counts against you.")).toBeTruthy();
});

it("says plainly when it counts as late, without blame", async () => {
  mockJob = job(20 * 60_000);
  await render(<GiveBackScreen />);
  expect(screen.getByText("Counts as a late give-back")).toBeTruthy();
  await fireEvent.press(screen.getByText("Something came up"));
  await fireEvent.press(screen.getByRole("button", { name: /Give it back/ }));
  await waitFor(() => expect(giveBackExpress).toHaveBeenCalled());
  expect((askConfirm as jest.Mock).mock.calls[0][0].consequence).toMatch(/late give-back this week/);
});

it("offers no give-back once the job has moved on", async () => {
  mockJob = job(60_000, "ready_for_dispatch");
  await render(<GiveBackScreen />);
  expect(screen.queryByRole("button", { name: /Give it back/ })).toBeNull();
  expect(screen.getByText(/can no longer be given back/)).toBeTruthy();
});
