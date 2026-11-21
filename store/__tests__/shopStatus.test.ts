jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  getShopStatus: jest.fn(),
  updateShopStatus: jest.fn(),
  getShopHours: jest.fn(),
}));

import { ApiError, getShopHours, getShopStatus, updateShopStatus } from "@/lib/api";
import { STALE_STATUS_MESSAGE, useShopStatus } from "@/store/shopStatus";

function body(version: number, overrides: Record<string, unknown> = {}) {
  return {
    version,
    hours: { version, schedule: { week: [], closures: [] }, temporarilyClosed: false },
    todayHours: [],
    isOpenNow: true,
    nextOpeningAt: null,
    expressEnabled: true,
    nightJobs: "off",
    nightWindow: null,
    printerDemandPings: false,
    pausedUntil: null,
    ...overrides,
  };
}

describe("the shop status store", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useShopStatus.getState().reset();
    (getShopHours as jest.Mock).mockResolvedValue({ hours: body(1).hours });
  });

  it("sends the version it read with every change and keeps GRIDGO's answer", async () => {
    (getShopStatus as jest.Mock).mockResolvedValue(body(3));
    (updateShopStatus as jest.Mock).mockResolvedValue(body(4, { expressEnabled: false }));
    await useShopStatus.getState().load();

    const outcome = await useShopStatus.getState().save({ expressEnabled: false });

    expect(updateShopStatus).toHaveBeenCalledWith(3, { expressEnabled: false });
    expect(outcome).toEqual({ ok: true, message: expect.stringMatching(/Express is off/) });
    expect(useShopStatus.getState().status).toMatchObject({ version: 4, expressEnabled: false });
  });

  it("reads the latest again when another phone changed the shop first", async () => {
    (getShopStatus as jest.Mock).mockResolvedValueOnce(body(3)).mockResolvedValueOnce(body(5, { nightJobs: "until_21" }));
    (updateShopStatus as jest.Mock).mockRejectedValue(new ApiError(409, { error: "shop_profile_stale" }));
    await useShopStatus.getState().load();

    const outcome = await useShopStatus.getState().save({ nightJobs: "all_night" });

    expect(outcome).toEqual({ ok: false, message: STALE_STATUS_MESSAGE });
    await new Promise((resolve) => setImmediate(resolve));
    expect(getShopStatus).toHaveBeenCalledTimes(2);
    expect(useShopStatus.getState().status).toMatchObject({ version: 5, nightJobs: "until_21" });
  });

  it("treats a missing route as not open yet, not a failure", async () => {
    (getShopStatus as jest.Mock).mockRejectedValue(new ApiError(404, { error: "not_found" }));
    await useShopStatus.getState().load();
    expect(useShopStatus.getState().phase).toBe("not_open_yet");
  });
});
