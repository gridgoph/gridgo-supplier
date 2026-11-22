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

  it("locks naming the turn it ends, and drops the token before GRIDGO answers", async () => {
    api.setWorkerToken("wkr_token");
    useShopWorker.setState({ shared: true, worker: { pinStaffId: "shp_lito", name: "Lito", role: "staff" } });
    let localAtLock: Record<string, string> = { unset: "" };
    (api.lockWorker as jest.Mock).mockImplementation(async () => {
      localAtLock = api.workerHeaders();
    });
    await useShopWorker.getState().lock();
    expect(api.lockWorker).toHaveBeenCalledWith("wkr_token");
    expect(localAtLock).toEqual({});
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

describe("review fixes on the shop phone", () => {
  const lito = { pinStaffId: "shp_lito", name: "Lito", role: "staff" as const };
  const ana = { pinStaffId: "shp_ana", name: "Ana", role: "staff" as const };
  const asWorker = (worker: typeof lito) => ({ ...owner, name: worker.name, shopRole: "staff", worker: { pinStaffId: worker.pinStaffId, name: worker.name } });

  it("does not hand the phone over when the owner's push cannot be removed, and keeps the token", async () => {
    usePush.setState({ token: "fcm-owner", claimed: true });
    (api.unregisterDevice as jest.Mock).mockRejectedValueOnce(new Error("Network request failed"));
    const refused = await useShopWorker.getState().enter("Print Hub");
    expect(refused).toMatch(/not handed over/);
    expect(usePush.getState().token).toBe("fcm-owner");
    expect(isSharedDevice()).toBe(false);
    expect(useShopWorker.getState().shared).toBe(false);
    expect(useSession.getState().identity).toEqual({ kind: "supplier" });

    const second = await useShopWorker.getState().enter("Print Hub");
    expect(second).toBeNull();
    expect(api.unregisterDevice).toHaveBeenLastCalledWith("fcm-owner");
    expect(usePush.getState().token).toBeNull();
    expect(isSharedDevice()).toBe(true);
  });

  it("treats a registration GRIDGO never had as already removed", async () => {
    usePush.setState({ token: "fcm-owner", claimed: true });
    (api.unregisterDevice as jest.Mock).mockRejectedValueOnce(new api.ApiError(404, { error: "not_found" }));
    expect(await useShopWorker.getState().enter("Print Hub")).toBeNull();
    expect(usePush.getState().token).toBeNull();
  });

  it("drops a delayed owner bootstrap that lands after a worker picked themselves", async () => {
    let answerOwner: (user: typeof owner) => void = () => {};
    (api.me as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { answerOwner = resolve; }));
    const bootstrap = useSession.getState().refresh();

    await useShopWorker.getState().enter("Print Hub");
    (api.selectWorker as jest.Mock).mockResolvedValue({ worker: lito, token: "wkr_lito", expiresAt: null });
    (api.me as jest.Mock).mockResolvedValueOnce(asWorker(lito));
    await useShopWorker.getState().select("shp_lito", "4821");
    expect(useSession.getState().user?.worker?.pinStaffId).toBe("shp_lito");

    answerOwner(owner);
    await bootstrap;
    expect(useSession.getState().user?.worker?.pinStaffId).toBe("shp_lito");
    expect(useSession.getState().user?.shopRole).toBe("staff");
  });

  it("never installs a plain owner bootstrap over the picker on a shared phone", async () => {
    await useShopWorker.getState().enter("Print Hub");
    (api.me as jest.Mock).mockResolvedValueOnce(owner);
    await useSession.getState().refresh();
    expect(useSession.getState().identity).toEqual({ kind: "device_locked" });
  });

  it("drops a worker read that lands after the phone was locked", async () => {
    await useShopWorker.getState().enter("Print Hub");
    (api.selectWorker as jest.Mock).mockResolvedValue({ worker: lito, token: "wkr_lito", expiresAt: null });
    let answer: (user: unknown) => void = () => {};
    (api.me as jest.Mock).mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    const picking = useShopWorker.getState().select("shp_lito", "4821");
    await Promise.resolve();
    await Promise.resolve();
    await useShopWorker.getState().lock();
    answer(asWorker(lito));
    await picking;
    expect(useSession.getState().identity).toEqual({ kind: "device_locked" });
    expect(api.workerHeaders()).toEqual({});
  });

  it("a late lock answer never ends the next worker's turn", async () => {
    await useShopWorker.getState().enter("Print Hub");
    (api.selectWorker as jest.Mock).mockResolvedValueOnce({ worker: lito, token: "wkr_lito", expiresAt: null });
    (api.me as jest.Mock).mockResolvedValueOnce(asWorker(lito));
    await useShopWorker.getState().select("shp_lito", "4821");

    let answerLock: () => void = () => {};
    (api.lockWorker as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { answerLock = resolve; }));
    const locking = useShopWorker.getState().lock();

    (api.selectWorker as jest.Mock).mockResolvedValueOnce({ worker: ana, token: "wkr_ana", expiresAt: null });
    (api.me as jest.Mock).mockResolvedValueOnce(asWorker(ana));
    const picking = useShopWorker.getState().select("shp_ana", "1234");
    // The pick waits for the lock still on its way.
    await Promise.resolve();
    expect(api.selectWorker).toHaveBeenCalledTimes(1);

    answerLock();
    await locking;
    await picking;
    expect(api.lockWorker).toHaveBeenCalledWith("wkr_lito");
    expect(api.workerHeaders()).toEqual({ "X-GRIDGO-Worker-Token": "wkr_ana" });
    expect(useShopWorker.getState().worker?.name).toBe("Ana");
  });

  it("a refusal for an ended turn is that turn's news, not the next one's", () => {
    api.setWorkerToken("wkr_ana");
    useShopWorker.setState({ shared: true, worker: ana });
    const lost = api.noteWorkerRefusal(new api.ApiError(403, { error: "shop_worker_invalid" }), "wkr_lito");
    expect(lost).toBeNull();
    expect(api.workerHeaders()).toEqual({ "X-GRIDGO-Worker-Token": "wkr_ana" });
    expect(useShopWorker.getState().worker?.name).toBe("Ana");

    expect(api.noteWorkerRefusal(new api.ApiError(403, { error: "shop_worker_invalid" }), "wkr_ana")).toBe("shop_worker_invalid");
    expect(api.workerHeaders()).toEqual({});
    expect(useShopWorker.getState().worker).toBeNull();
  });

  it("keeps the Owner's screens while the push removal is still out, even through a refresh", async () => {
    usePush.setState({ token: "fcm-owner", claimed: true });
    let fail: (error: Error) => void = () => {};
    (api.unregisterDevice as jest.Mock).mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const entering = useShopWorker.getState().enter("Print Hub");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(api.unregisterDevice).toHaveBeenCalledWith("fcm-owner");

    // The ordinary Owner bootstrap lands before GRIDGO answers the removal.
    (api.me as jest.Mock).mockResolvedValueOnce(owner);
    await useSession.getState().refresh();
    expect(useSession.getState().identity).toEqual({ kind: "supplier" });
    expect(isSharedDevice()).toBe(false);

    // Nobody can pick themselves on a phone that is not handed over yet.
    expect(await useShopWorker.getState().select("shp_lito", "4821")).toMatch(/not set up for PIN staff/);
    expect(api.selectWorker).not.toHaveBeenCalled();

    fail(new Error("Network request failed"));
    expect(await entering).toMatch(/not handed over/);
    expect(useSession.getState().identity).toEqual({ kind: "supplier" });
    expect(usePush.getState().token).toBe("fcm-owner");
    expect(useShopWorker.getState().shared).toBe(false);
  });

  it("does not register the Owner's push while the handover is pending", async () => {
    usePush.setState({ token: "fcm-owner", claimed: true });
    let answer: () => void = () => {};
    (api.unregisterDevice as jest.Mock).mockImplementationOnce(() => new Promise<void>((resolve) => { answer = resolve; }));
    const entering = useShopWorker.getState().enter("Print Hub");
    await new Promise((resolve) => setTimeout(resolve, 0));
    const { personalPushPaused } = jest.requireActual("@/lib/sharedDevice") as typeof import("@/lib/sharedDevice");
    expect(personalPushPaused()).toBe(true);
    expect(isSharedDevice()).toBe(false);
    answer();
    expect(await entering).toBeNull();
    expect(isSharedDevice()).toBe(true);
    expect(useSession.getState().identity).toEqual({ kind: "device_locked" });
  });
});
