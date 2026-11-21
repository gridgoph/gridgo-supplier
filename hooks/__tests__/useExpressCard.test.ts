import { act, renderHook } from "@testing-library/react-native";
import { router } from "expo-router";

import { useExpressCard } from "@/hooks/useExpressCard";
import * as api from "@/lib/api";
import type { Order } from "@/lib/api";

import ownerRead from "@/lib/__tests__/fixtures/expressProductionOwner.json";
import staffRead from "@/lib/__tests__/fixtures/expressProductionStaff.json";

/**
 * "It's ready" on an Express card when its two requests do not both land
 * (gridgo-supplier#269): the job is already on the press, and the next tap —
 * or the next time the job is opened — must send ready, not open the
 * finished-photo screen. The reads are real API projections (see
 * `lib/__tests__/expressReadiness.test.ts`).
 */
jest.mock("expo-router", () => ({ router: { push: jest.fn(), navigate: jest.fn() } }));
jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  transitionOrder: jest.fn(),
  acceptExpress: jest.fn(),
}));

const transition = api.transitionOrder as jest.MockedFunction<typeof api.transitionOrder>;
const push = router.push as jest.Mock;

const inProduction = (read: unknown) =>
  ({
    ...(read as Order),
    // Fresh enough that nothing reads as late or expired on the test's clock.
    shopAcceptance: { ...(read as Order).shopAcceptance, deadlineAt: new Date(Date.now() + 60_000).toISOString() },
  }) as Order;
const accepted = (read: unknown) =>
  ({
    ...inProduction(read),
    state: "payment_authorized",
    expressOrder: { ...((read as Order).expressOrder as object), status: "accepted" },
  }) as unknown as Order;

beforeEach(() => {
  transition.mockReset();
  push.mockReset();
});

describe.each([
  ["Owner", ownerRead],
  ["Staff", staffRead],
])("It's ready, as %s", (_who, read) => {
  it("an interrupted chain leaves It's ready on the card, not the photo screen", async () => {
    transition
      .mockResolvedValueOnce(inProduction(read))
      .mockRejectedValueOnce(new TypeError("Network request failed"));
    const reload = jest.fn(async () => undefined);
    const { result } = await renderHook(() => useExpressCard(accepted(read), reload));

    let done = true;
    await act(async () => {
      done = await result.current.ready();
    });

    expect(done).toBe(false);
    expect(transition.mock.calls.map((call) => call[1])).toEqual(["production", "ready_for_dispatch"]);
    expect(push).not.toHaveBeenCalled();
    expect(result.current.error).toBeTruthy();
  });

  it("a job reopened in production sends ready alone", async () => {
    transition.mockResolvedValueOnce({ ...inProduction(read), state: "ready_for_dispatch" } as Order);
    const { result } = await renderHook(() => useExpressCard(inProduction(read), jest.fn(async () => undefined)));

    let done = false;
    await act(async () => {
      done = await result.current.ready();
    });

    expect(done).toBe(true);
    expect(transition.mock.calls.map((call) => call[1])).toEqual(["ready_for_dispatch"]);
    expect(push).not.toHaveBeenCalled();
  });
});
