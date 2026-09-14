import type { Notification } from "@/lib/api";
import * as alertsApi from "@/lib/alertsApi";
import { isAlertUnread, useAlertsStore, visibleAlerts } from "@/store/alerts";

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

/** GRIDGO accepted the change. */
function platformAccepts() {
  jest.spyOn(alertsApi, "markRead").mockResolvedValue({ status: "saved" });
  jest.spyOn(alertsApi, "markAllRead").mockResolvedValue({ status: "saved" });
  jest.spyOn(alertsApi, "remove").mockResolvedValue({ status: "saved" });
}

/** The routes are not deployed yet, so the device remembers instead. */
function routesAbsent() {
  jest.spyOn(alertsApi, "markRead").mockResolvedValue({ status: "not_open_yet" });
  jest.spyOn(alertsApi, "markAllRead").mockResolvedValue({ status: "not_open_yet" });
  jest.spyOn(alertsApi, "remove").mockResolvedValue({ status: "not_open_yet" });
}

describe("alerts store", () => {
  beforeEach(() => {
    useAlertsStore.setState({
      dismissed: [],
      deleted: [],
      unreadCount: 0,
      localOnly: false,
      streamCursor: null,
    });
    platformAccepts();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("counts what the platform says is unread", () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b"), alert("c", true)]);
    expect(useAlertsStore.getState().unreadCount).toBe(2);
  });

  it("drops the badge when one is cleared", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    await useAlertsStore.getState().markRead("a");
    expect(useAlertsStore.getState().unreadCount).toBe(1);
    expect(useAlertsStore.getState().dismissed).toEqual(["a"]);
  });

  it("does not double-count a second clear of the same alert", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    await useAlertsStore.getState().markRead("a");
    await useAlertsStore.getState().markRead("a");
    expect(useAlertsStore.getState().unreadCount).toBe(1);
    expect(useAlertsStore.getState().dismissed).toEqual(["a"]);
  });

  it("forgets ids the platform no longer serves", () => {
    useAlertsStore.setState({ dismissed: ["old", "a"], deleted: ["gone"] });
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    expect(useAlertsStore.getState().dismissed).toEqual(["a"]);
    expect(useAlertsStore.getState().deleted).toEqual([]);
  });

  it("remembers the last stream event so a refresh does not replay the inbox", () => {
    useAlertsStore.getState().rememberStreamCursor("ntf_last");
    expect(useAlertsStore.getState().streamCursor).toBe("ntf_last");
  });

  it("marks exactly the ids it was given, never everything", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b"), alert("c")]);
    await useAlertsStore.getState().markManyRead(["a", "b"]);
    expect(alertsApi.markAllRead).toHaveBeenCalledWith(["a", "b"]);
    expect(useAlertsStore.getState().unreadCount).toBe(1);
    expect(useAlertsStore.getState().dismissed).toEqual(["a", "b"]);
  });
});

/**
 * The captain's rule: a swipe that silently un-deletes on the next refresh is
 * worse than no swipe. Until the platform's delete route is live, the device
 * has to remember — and the list has to honour it on every reload.
 */
describe("deleting", () => {
  beforeEach(() => {
    useAlertsStore.setState({
      dismissed: [],
      deleted: [],
      unreadCount: 0,
      localOnly: false,
      streamCursor: null,
    });
    platformAccepts();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("takes the alert off the list and out of the badge", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    await useAlertsStore.getState().remove("a");
    expect(useAlertsStore.getState().unreadCount).toBe(1);
    expect(visibleAlerts([alert("a"), alert("b")], useAlertsStore.getState().deleted)).toEqual([
      alert("b"),
    ]);
  });

  it("keeps it deleted across a reload that still serves it", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    await useAlertsStore.getState().remove("a");
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    expect(useAlertsStore.getState().deleted).toEqual(["a"]);
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("does not take the badge down twice for an alert already cleared", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    await useAlertsStore.getState().markRead("a");
    await useAlertsStore.getState().remove("a");
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("clears every id it was given, and empties the badge", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b"), alert("c")]);
    await useAlertsStore.getState().removeMany(["a", "b", "c"]);
    expect(alertsApi.remove).toHaveBeenCalledTimes(3);
    expect(useAlertsStore.getState().deleted).toEqual(["a", "b", "c"]);
    expect(useAlertsStore.getState().unreadCount).toBe(0);
    expect(visibleAlerts([alert("a"), alert("b"), alert("c")], useAlertsStore.getState().deleted)).toEqual(
      [],
    );
  });

  it("keeps what already went when GRIDGO refuses one", async () => {
    jest
      .spyOn(alertsApi, "remove")
      .mockResolvedValueOnce({ status: "saved" })
      .mockResolvedValueOnce({ status: "failed", message: "GRIDGO could not delete that alert." });
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    const outcome = await useAlertsStore.getState().removeMany(["a", "b"]);
    expect(outcome).toEqual({
      status: "failed",
      message: "GRIDGO could not delete that alert.",
    });
    expect(useAlertsStore.getState().deleted).toEqual(["a"]);
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });
});

describe("when a route is not deployed yet", () => {
  beforeEach(() => {
    useAlertsStore.setState({
      dismissed: [],
      deleted: [],
      unreadCount: 0,
      localOnly: false,
      streamCursor: null,
    });
    routesAbsent();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("still works, and says the change lives on this phone", async () => {
    useAlertsStore.getState().syncFrom([alert("a")]);
    await useAlertsStore.getState().markRead("a");
    expect(useAlertsStore.getState().unreadCount).toBe(0);
    expect(useAlertsStore.getState().localOnly).toBe(true);
    expect(isAlertUnread(alert("a"), useAlertsStore.getState().dismissed)).toBe(false);
  });
});

describe("when GRIDGO refuses", () => {
  beforeEach(() => {
    useAlertsStore.setState({
      dismissed: [],
      deleted: [],
      unreadCount: 0,
      localOnly: false,
      streamCursor: null,
    });
    jest
      .spyOn(alertsApi, "remove")
      .mockResolvedValue({ status: "failed", message: "GRIDGO could not delete that alert." });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  /** A row that vanished on a failed request would be lying about the record. */
  it("changes nothing, and hands the reason back to the screen", async () => {
    useAlertsStore.getState().syncFrom([alert("a")]);
    const outcome = await useAlertsStore.getState().remove("a");
    expect(outcome.status).toBe("failed");
    expect(useAlertsStore.getState().deleted).toEqual([]);
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });
});

describe("persisted alert ownership", () => {
  it.each([true, false])("retains local decisions with hydration first: %s", async (hydrateFirst) => {
    useAlertsStore.setState({ ownerId: null, ownerBound: false, dismissed: [], deleted: [] });
    const original = useAlertsStore.persist.getOptions().storage;
    let receive!: (value: { state: { ownerId: string; dismissed: string[]; deleted: string[] } }) => void;
    useAlertsStore.persist.setOptions({ storage: {
      getItem: () => new Promise((resolve) => { receive = resolve; }),
      setItem: jest.fn(),
      removeItem: jest.fn(),
    } });
    try {
      const hydration = useAlertsStore.persist.rehydrate();
      if (!hydrateFirst) useAlertsStore.getState().bindOwner("shop_a");
      receive({ state: { ownerId: "shop_a", dismissed: ["read"], deleted: ["gone"] } });
      await hydration;
      if (hydrateFirst) useAlertsStore.getState().bindOwner("shop_a");
      expect(useAlertsStore.getState().dismissed).toEqual(["read"]);
      expect(useAlertsStore.getState().deleted).toEqual(["gone"]);
      useAlertsStore.getState().bindOwner("shop_b");
      expect(useAlertsStore.getState().dismissed).toEqual([]);
      expect(useAlertsStore.getState().deleted).toEqual([]);
    } finally {
      useAlertsStore.persist.setOptions({ storage: original });
    }
  });

  it("rejects late hydration for a different restored owner", async () => {
    useAlertsStore.setState({ ownerId: null, ownerBound: false, dismissed: [], deleted: [] });
    useAlertsStore.getState().bindOwner("shop_b");
    const original = useAlertsStore.persist.getOptions().storage;
    useAlertsStore.persist.setOptions({ storage: {
      getItem: async () => ({ state: { ownerId: "shop_a", dismissed: ["read"], deleted: ["gone"] } }),
      setItem: jest.fn(), removeItem: jest.fn(),
    } });
    try {
      await useAlertsStore.persist.rehydrate();
      expect(useAlertsStore.getState().ownerId).toBe("shop_b");
      expect(useAlertsStore.getState().dismissed).toEqual([]);
    } finally {
      useAlertsStore.persist.setOptions({ storage: original });
    }
  });
});
