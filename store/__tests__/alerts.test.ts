import * as api from "@/lib/api";
import { setLiveOwner } from "@/lib/live";
import type { Notification } from "@/lib/api";
import * as alertsApi from "@/lib/alertsApi";
import * as buildDistribution from "@/lib/buildDistribution";
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

/** A release notice as GRIDGO writes it for one install channel. */
function release(id: string, releaseChannel: string, storeTarget: string, title: string): Notification {
  return { ...alert(id), type: "announcement", releaseChannel, storeTarget, title };
}

/** An APK notice written before channels: only its title says what it is. */
function legacyRelease(id: string): Notification {
  return { ...alert(id), type: "announcement", title: "GRIDGO Supplier 1.0.120 is ready" };
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

describe("shared alert refresh ordering", () => {
  afterEach(() => { jest.restoreAllMocks(); setLiveOwner(null); });

  it("does not let an older reader lower a newer unread count", async () => {
    useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0 });
    let receive!: (items: Notification[]) => void;
    jest.spyOn(api, "listNotifications")
      .mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }))
      .mockResolvedValue([alert("one"), alert("two")]);
    const earlier = useAlertsStore.getState().refresh();
    await useAlertsStore.getState().refresh();
    expect(useAlertsStore.getState().unreadCount).toBe(2);
    receive([alert("one")]);
    await earlier;
    expect(useAlertsStore.getState().unreadCount).toBe(2);
  });

  it("rejects a badge response from the previous account", async () => {
    setLiveOwner("first");
    useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0 });
    let receive!: (items: Notification[]) => void;
    jest.spyOn(api, "listNotifications").mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }));
    const earlier = useAlertsStore.getState().refresh();
    setLiveOwner("second");
    receive([alert("private")]);
    await earlier;
    expect(useAlertsStore.getState().unreadCount).toBe(0);
  });
});

describe("alert writes racing with snapshots", () => {
  beforeEach(() => {
    useAlertsStore.setState({ dismissed: [], deleted: [], unreadIds: [], unreadCount: 0 });
  });
  afterEach(() => { jest.restoreAllMocks(); setLiveOwner(null); });

  it.each(["markRead", "markManyRead", "remove"] as const)("does not recount %s already reflected by a refresh", async (operation) => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    let complete!: (outcome: alertsApi.AlertWriteOutcome) => void;
    const pending = new Promise<alertsApi.AlertWriteOutcome>((resolve) => { complete = resolve; });
    jest.spyOn(alertsApi, operation === "markManyRead" ? "markAllRead" : operation).mockReturnValueOnce(pending);
    const write = operation === "markManyRead"
      ? useAlertsStore.getState().markManyRead(["a"])
      : useAlertsStore.getState()[operation]("a");
    jest.spyOn(api, "listNotifications").mockResolvedValue(operation === "remove" ? [alert("b")] : [alert("a", true), alert("b")]);
    await useAlertsStore.getState().refresh();
    expect(useAlertsStore.getState().unreadCount).toBe(1);
    complete({ status: "saved" });
    await write;
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("counts a stale snapshot using writes completed during the read", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    let receive!: (items: Notification[]) => void;
    jest.spyOn(api, "listNotifications").mockReturnValueOnce(new Promise((resolve) => { receive = resolve; }));
    const read = useAlertsStore.getState().refresh();
    jest.spyOn(alertsApi, "markRead").mockResolvedValue({ status: "saved" });
    await useAlertsStore.getState().markRead("a");
    receive([alert("a"), alert("b")]);
    await read;
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("does not recount concurrent read and delete completions for one alert", async () => {
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    jest.spyOn(alertsApi, "markRead").mockResolvedValue({ status: "saved" });
    jest.spyOn(alertsApi, "remove").mockResolvedValue({ status: "saved" });
    await Promise.all([useAlertsStore.getState().markRead("a"), useAlertsStore.getState().remove("a")]);
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("does not decrement for an alert the server already marked read", async () => {
    useAlertsStore.getState().syncFrom([alert("a", true), alert("b")]);
    jest.spyOn(alertsApi, "remove").mockResolvedValue({ status: "saved" });
    await useAlertsStore.getState().remove("a");
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });

  it("discards a write completion after the account changes", async () => {
    setLiveOwner("before-write");
    useAlertsStore.getState().syncFrom([alert("a"), alert("b")]);
    let complete!: (outcome: alertsApi.AlertWriteOutcome) => void;
    jest.spyOn(alertsApi, "markRead").mockReturnValueOnce(new Promise((resolve) => { complete = resolve; }));
    const write = useAlertsStore.getState().markRead("a");
    setLiveOwner("after-write");
    useAlertsStore.getState().bindOwner("after-write");
    useAlertsStore.getState().syncFrom([alert("other")]);
    complete({ status: "saved" });
    await write;
    expect(useAlertsStore.getState().dismissed).toEqual([]);
    expect(useAlertsStore.getState().unreadCount).toBe(1);
  });
});

/**
 * The captain's iPhone listed "1.0.185 is ready — Update now" APK notices
 * beside the TestFlight ones. GRIDGO writes one notice per channel, and an
 * account with no registered install still gets the APK one.
 */
describe("release notices for another install channel", () => {
  const inbox = [
    alert("job"),
    { ...alert("staff"), type: "announcement", title: "Holiday hours" },
    release("apk", "apk", "apk_download", "GRIDGO Supplier 1.0.185 is ready"),
    release("play", "play", "play_store", "GRIDGO Supplier 1.0.185 is on the Play Store"),
    release("ios", "ios", "testflight", "GRIDGO Supplier 1.0.5 is in TestFlight"),
    legacyRelease("legacy"),
  ];
  const ids = (list: Notification[]) => list.map((item) => item.id);

  beforeEach(() => {
    useAlertsStore.setState({ dismissed: [], deleted: [], unreadCount: 0, unreadIds: [] });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows an iPhone only the TestFlight notice", () => {
    expect(ids(visibleAlerts(inbox, [], "ios"))).toEqual(["job", "staff", "ios"]);
  });

  it("shows a Play install only the Play notice", () => {
    expect(ids(visibleAlerts(inbox, [], "play"))).toEqual(["job", "staff", "play"]);
  });

  it("shows an APK install the APK notice and the ones sent before channels", () => {
    expect(ids(visibleAlerts(inbox, [], "apk"))).toEqual(["job", "staff", "apk", "legacy"]);
  });

  it("shows a build with no channel no release notice at all", () => {
    expect(ids(visibleAlerts(inbox, [], null))).toEqual(["job", "staff"]);
  });

  it("hides a channel this app does not know", () => {
    expect(ids(visibleAlerts([release("x", "huawei", "app_gallery", "GRIDGO Supplier 2.0.0")], [], "apk"))).toEqual([]);
  });

  it.each(["ios", "play", "apk"] as const)("keeps the %s badge to the rows that install shows", (channel) => {
    jest.spyOn(buildDistribution, "installChannel").mockReturnValue(channel);
    useAlertsStore.getState().syncFrom(inbox);
    const shown = ids(visibleAlerts(inbox, []));
    expect(useAlertsStore.getState().unreadIds).toEqual(shown);
    expect(useAlertsStore.getState().unreadCount).toBe(shown.length);
  });

  it("hides another channel's notice without deleting it", () => {
    jest.spyOn(buildDistribution, "installChannel").mockReturnValue("ios");
    const remove = jest.spyOn(alertsApi, "remove");
    useAlertsStore.getState().syncFrom(inbox);
    expect(useAlertsStore.getState().deleted).toEqual([]);
    expect(remove).not.toHaveBeenCalled();
  });
});
