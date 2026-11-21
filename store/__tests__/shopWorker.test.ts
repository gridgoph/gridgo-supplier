jest.mock("@/lib/api", () => ({
  ...jest.requireActual("@/lib/api"),
  selectWorker: jest.fn(),
  lockWorker: jest.fn(async () => undefined),
  unregisterDevice: jest.fn(async () => undefined),
  me: jest.fn(),
}));

import * as api from "@/lib/api";
import { isSharedDevice } from "@/lib/sharedDevice";
import { usePush } from "@/store/push";
import { useSession } from "@/store/session";
import { pickProblem, useShopWorker } from "@/store/shopWorker";

const owner = { id: "supplier_123", email: "a@shop.ph", name: "Owner", role: "supplier" as const, verificationStatus: "approved" as const };

beforeEach(() => {
  jest.clearAllMocks();
  useShopWorker.getState().reset();
  api.setWorkerToken(null);
  useSession.setState({ user: owner, identity: { kind: "supplier" }, authSource: "clerk" });
});

describe("the shop phone", () => {
  it("takes the owner's push registration off before the phone is shared, then shows the picker", async () => {
    usePush.setState({ token: "fcm-owner", claimed: true });
    await useShopWorker.getState().enter("Print Hub");
    expect(api.unregisterDevice).toHaveBeenCalledWith("fcm-owner");
    expect(usePush.getState().token).toBeNull();
    expect(isSharedDevice()).toBe(true);
    expect(useSession.getState().identity).toEqual({ kind: "device_locked" });
  });

  it("sends the turn's token on shop calls after a right PIN", async () => {
    (api.selectWorker as jest.Mock).mockResolvedValue({
      worker: { pinStaffId: "shp_lito", name: "Lito", role: "staff" },
      token: "wkr_token",
      expiresAt: null,
    });
    (api.me as jest.Mock).mockResolvedValue({ ...owner, name: "Lito", shopRole: "staff", worker: { pinStaffId: "shp_lito", name: "Lito" } });
    await useShopWorker.getState().enter("Print Hub");
    const refused = await useShopWorker.getState().select("shp_lito", "4821");
    expect(refused).toBeNull();
    expect(api.selectWorker).toHaveBeenCalledWith("shp_lito", "4821");
    expect(api.workerHeaders()).toEqual({ "X-GRIDGO-Worker-Token": "wkr_token" });
    expect(useShopWorker.getState().worker?.name).toBe("Lito");
  });

  it.each([
    ["shop_pin_invalid", /PIN is not right/],
    ["shop_pin_rate_limited", /Wait 15 minutes/],
    ["shop_member_not_found", /no longer on the team/],
  ])("says %s in words and keeps the phone locked", async (code, words) => {
    (api.selectWorker as jest.Mock).mockRejectedValue(new api.ApiError(code === "shop_pin_rate_limited" ? 429 : 403, { error: code }));
    await useShopWorker.getState().enter("Print Hub");
    const refused = await useShopWorker.getState().select("shp_lito", "0000");
    expect(refused).toMatch(words);
    expect(refused).not.toContain(code);
    expect(refused).not.toContain("0000");
    expect(api.workerHeaders()).toEqual({});
    expect(useSession.getState().identity).toEqual({ kind: "device_locked" });
  });

  it("locks with the turn's token still on the call, then drops it", async () => {
    api.setWorkerToken("wkr_token");
    useShopWorker.setState({ shared: true, worker: { pinStaffId: "shp_lito", name: "Lito", role: "staff" } });
    let headersAtLock: Record<string, string> = {};
    (api.lockWorker as jest.Mock).mockImplementation(async () => {
      headersAtLock = api.workerHeaders();
    });
    await useShopWorker.getState().lock();
    expect(headersAtLock).toEqual({ "X-GRIDGO-Worker-Token": "wkr_token" });
    expect(api.workerHeaders()).toEqual({});
    expect(useSession.getState().identity).toEqual({ kind: "device_locked" });
  });

  it("goes back to the picker, never the owner, when GRIDGO ends the turn", () => {
    useShopWorker.setState({ shared: true, worker: { pinStaffId: "shp_lito", name: "Lito", role: "staff" } });
    useShopWorker.getState().lost("shop_worker_invalid");
    expect(useShopWorker.getState().worker).toBeNull();
    expect(useShopWorker.getState().notice).toBe("timed_out");
    expect(useSession.getState().identity).toEqual({ kind: "device_locked" });
  });

  it("forgets the shop phone on sign-out", () => {
    useShopWorker.setState({ shared: true, shopName: "Print Hub" });
    useSession.setState({ identity: { kind: "signed_out" } });
    expect(useShopWorker.getState().shared).toBe(false);
    expect(isSharedDevice()).toBe(false);
  });

  it("never repeats a code it does not know", () => {
    expect(pickProblem(new api.ApiError(500, { error: "weird_code" }))).not.toContain("weird_code");
  });
});
