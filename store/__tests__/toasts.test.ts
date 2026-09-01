import { MAX_TOASTS, shouldToast, useToasts } from "@/store/toasts";

beforeEach(() => {
  useToasts.getState().clear();
});

describe("what is worth interrupting for", () => {
  it("toasts news about a job the shop is not looking at", () => {
    expect(shouldToast({ orderId: "ord_2" }, { orderId: "ord_1", onAlerts: false })).toBe(true);
    expect(shouldToast({}, { orderId: null, onAlerts: false })).toBe(true);
  });

  /** Toasting the job on screen is telling someone what they are reading. */
  it("stays quiet about the job already on screen", () => {
    expect(shouldToast({ orderId: "ord_1" }, { orderId: "ord_1", onAlerts: false })).toBe(false);
  });

  it("stays quiet on the alerts list, where it would already be visible", () => {
    expect(shouldToast({ orderId: "ord_2" }, { orderId: null, onAlerts: true })).toBe(false);
  });

  it("does not interrupt for an alert the shop has already read", () => {
    expect(
      shouldToast({ id: "ntf_1", read: true }, { orderId: null, onAlerts: false }),
    ).toBe(false);
    expect(
      shouldToast({ id: "ntf_1", read: false }, { orderId: null, onAlerts: false }, ["ntf_1"]),
    ).toBe(false);
  });
});

describe("the stack", () => {
  it("shows the newest first and does not bury the screen", () => {
    for (const id of ["a", "b", "c"]) {
      useToasts.getState().show({ id, title: id, body: id });
    }
    const { toasts } = useToasts.getState();
    expect(toasts).toHaveLength(MAX_TOASTS);
    expect(toasts[0].id).toBe("c");
  });

  it("never shows the same alert twice", () => {
    useToasts.getState().show({ id: "a", title: "a", body: "a" });
    useToasts.getState().show({ id: "a", title: "a", body: "a" });
    expect(useToasts.getState().toasts).toHaveLength(1);
  });

  it("can be dismissed by hand", () => {
    useToasts.getState().show({ id: "a", title: "a", body: "a" });
    useToasts.getState().dismiss("a");
    expect(useToasts.getState().toasts).toEqual([]);
  });
});
