import type { Notification } from "@/lib/api";
import { isAlertUnread, useAlertsStore } from "@/store/alerts";

function alert(id: string, read = false): Notification {
  return {
    id,
    userId: "user_supplier",
    title: `Alert ${id}`,
    body: "Body",
    read,
    at: "2026-08-10T12:00:00.000Z",
  };
}

/**
 * GRIDGO has no route for marking a notification read, so dismissing one is a
 * decision this device remembers. These cover the consequences of that: the
 * badge has to honour local dismissals, and the remembered list must not grow
 * without bound on a shop that has been running for months.
 */
describe("alerts store", () => {
  beforeEach(() => {
    useAlertsStore.setState({ dismissed: [], unreadCount: 0 });
  });

  it("counts what the platform says is unread", () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b"), alert("c", true)]);
    expect(useAlertsStore.getState().unreadCount).toBe(2);
  });

  it("drops the badge when one is cleared on this device", () => {
    const store = useAlertsStore.getState();
    store.syncFrom([alert("a"), alert("b")]);
    useAlertsStore.getState().markRead("a");
    expect(useAlertsStore.getState().unreadCount).toBe(1);
    expect(useAlertsStore.getState().dismissed).toEqual(["a"]);
  });

  it("does not double-count a second clear of the same alert", () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    useAlertsStore.getState().markRead("a");
    useAlertsStore.getState().markRead("a");
    expect(useAlertsStore.getState().unreadCount).toBe(1);
    expect(useAlertsStore.getState().dismissed).toEqual(["a"]);
  });

  it("keeps a cleared alert cleared across a reload", () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    useAlertsStore.getState().markRead("a");
    // The platform still reports it unread — nothing told it otherwise.
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("forgets ids the platform no longer serves", () => {
    useAlertsStore.setState({ dismissed: ["old", "a"] });
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    expect(useAlertsStore.getState().dismissed).toEqual(["a"]);
  });
});

describe("isAlertUnread", () => {
  it("treats the platform's flag and this device's dismissal the same way", () => {
    expect(isAlertUnread(alert("a"), [])).toBe(true);
    expect(isAlertUnread(alert("a"), ["a"])).toBe(false);
    expect(isAlertUnread(alert("a", true), [])).toBe(false);
  });
});
