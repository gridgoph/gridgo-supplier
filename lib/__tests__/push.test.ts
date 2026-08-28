import {
  devicePlatform,
  parsePushData,
  PUSH_CHANNEL_ID,
  PUSH_FOREGROUND_BEHAVIOR,
  pushOffer,
  pushOfferCopy,
  pushTargetRoute,
  readPushPermission,
} from "@/lib/push";

describe("the channel the server names", () => {
  it("is the server's own identifier", () => {
    // Not this app's to choose: the server sets `channel_id` on every message
    // and Android 8+ drops or downgrades one naming a channel that does not
    // exist. All three GRIDGO apps must use this exact string.
    expect(PUSH_CHANNEL_ID).toBe("gridgo_default");
  });
});

describe("devicePlatform", () => {
  it("passes through the three the contract accepts", () => {
    expect(devicePlatform("android")).toBe("android");
    expect(devicePlatform("ios")).toBe("ios");
    expect(devicePlatform("web")).toBe("web");
  });

  it("refuses anything else rather than earning a 400", () => {
    expect(devicePlatform("windows")).toBeNull();
    expect(devicePlatform("macos")).toBeNull();
  });
});

describe("parsePushData", () => {
  it("reads the four contractual keys", () => {
    expect(
      parsePushData({
        notificationId: "ntf_9c1f3a",
        type: "supplier_job_offered",
        orderId: "ord_demo_1",
        at: "2026-08-11T02:00:00.000Z",
      }),
    ).toEqual({
      notificationId: "ntf_9c1f3a",
      type: "supplier_job_offered",
      orderId: "ord_demo_1",
      at: "2026-08-11T02:00:00.000Z",
    });
  });

  it("leaves an absent key null — an alert with no job carries no orderId", () => {
    expect(parsePushData({ notificationId: "ntf_1", type: "account_update" })).toEqual({
      notificationId: "ntf_1",
      type: "account_update",
      orderId: null,
      at: null,
    });
  });

  it("never throws on a payload that has drifted", () => {
    // A tap must always land somewhere. Whatever arrives, this returns a shape.
    for (const raw of [null, undefined, "", 7, [], { orderId: { id: 1 } }]) {
      expect(() => parsePushData(raw)).not.toThrow();
    }
    expect(parsePushData(null).orderId).toBeNull();
    expect(parsePushData({ orderId: { id: 1 } }).orderId).toBeNull();
  });

  it("treats a blank string as absent, not as an id", () => {
    expect(parsePushData({ orderId: "   " }).orderId).toBeNull();
  });
});

describe("pushTargetRoute", () => {
  it("opens the workspace of the job an alert is about", () => {
    // Every one of the four interrupting events is acted on there: Accept and
    // Decline, the yellow proof step, the pickup handoff, and the issue that
    // is holding the money. `lib/jobState` has already decided which leads.
    expect(pushTargetRoute(parsePushData({ orderId: "ord_demo_1" }))).toBe("/job/ord_demo_1");
  });

  it("opens the alerts list when there is no job behind the alert", () => {
    expect(pushTargetRoute(parsePushData({ type: "account_update" }))).toBe(
      "/alerts",
    );
  });

  it("opens the alerts list for a type this build has never heard of", () => {
    // The contract's own instruction: treat an unknown type as "open the list".
    // Guessing a screen from a string added after this build shipped is how a
    // tap lands somewhere that cannot explain itself.
    expect(pushTargetRoute(parsePushData({ type: "invented_in_2027" }))).toBe(
      "/alerts",
    );
  });
});

describe("readPushPermission", () => {
  it("reads a grant", () => {
    expect(readPushPermission({ granted: true, status: "granted", canAskAgain: false })).toBe(
      "granted",
    );
  });

  it("reads a phone that has not been asked", () => {
    expect(readPushPermission({ granted: false, status: "undetermined", canAskAgain: true })).toBe(
      "undetermined",
    );
  });

  it("separates a refusal the app may re-ask from one it may not", () => {
    // The whole reason the state exists. On Android 13+ a refusal stops the OS
    // offering the dialog, so an app that keeps calling request() shows the
    // person nothing at all and looks broken.
    expect(readPushPermission({ granted: false, status: "denied", canAskAgain: true })).toBe(
      "undetermined",
    );
    expect(readPushPermission({ granted: false, status: "denied", canAskAgain: false })).toBe(
      "blocked",
    );
  });

  it("counts iOS provisional authorisation as granted", () => {
    expect(readPushPermission({ granted: true, status: "provisional" })).toBe("granted");
  });
});

describe("pushOffer", () => {
  const base = { supported: true, signedIn: true, permission: "undetermined" as const };

  it("offers the ask to a signed-in shop that has not been asked", () => {
    expect(pushOffer(base)).toBe("ask");
  });

  it("offers nothing once permission is granted", () => {
    expect(pushOffer({ ...base, permission: "granted" })).toBe("hidden");
  });

  it("sends a blocked phone to its own settings, which is the only thing that works", () => {
    expect(pushOffer({ ...base, permission: "blocked" })).toBe("settings");
  });

  it("offers nothing where push cannot work at all", () => {
    // Web has no service worker in this MVP; a card leading nowhere is worse
    // than no card.
    expect(pushOffer({ ...base, supported: false })).toBe("hidden");
    expect(pushOffer({ ...base, supported: false, signedIn: false })).toBe("hidden");
  });

  it("still asks at the door, because a shop that never signs in must be reachable", () => {
    // The one rule that differs from the client app. On Android 13+ the
    // permission can only be asked while the app is open, so a door that never
    // asks is a phone GRIDGO can never tell to update.
    expect(pushOffer({ ...base, signedIn: false })).toBe("ask");
  });

  it("tells a signed-out phone nothing it cannot act on", () => {
    // "Notifications are blocked" and "registration failed" are both about an
    // account that does not exist yet, to somebody standing at a sign-in
    // screen. Neither earns space on the door.
    expect(pushOffer({ ...base, signedIn: false, permission: "blocked" })).toBe("hidden");
    expect(pushOffer({ ...base, signedIn: false, permission: "granted" })).toBe("hidden");
    expect(pushOffer({ ...base, signedIn: false, permission: "unknown" })).toBe("hidden");
    expect(pushOffer({ ...base, signedIn: false, failed: true })).toBe("ask");
  });

  it("keeps saying so when a granted phone failed to register", () => {
    // The worst state: it looks exactly like a working phone and simply never
    // rings. Nothing else in the app would ever mention it.
    expect(pushOffer({ ...base, permission: "granted", failed: true })).toBe("retry");
  });

  it("still sends a blocked phone to settings even when something failed", () => {
    expect(pushOffer({ ...base, permission: "blocked", failed: true })).toBe("settings");
  });

  it("offers nothing before the permission has been read", () => {
    // Expo Go and web never resolve one. Drawing an ask that cannot be
    // answered would be the app promising something it cannot do.
    expect(pushOffer({ ...base, permission: "unknown" })).toBe("hidden");
  });
});

describe("pushOfferCopy", () => {
  it("names a shop's own work, in the order a shop would rank it", () => {
    // A person answering a prompt they can only answer once deserves to know
    // it is their jobs and their money, not marketing.
    const copy = pushOfferCopy("ask");
    expect(copy.body).toMatch(/offers your shop work/i);
    expect(copy.body).toMatch(/waiting on your evidence/i);
    expect(copy.body).toMatch(/rider/i);
    expect(copy.body).toMatch(/pays/i);
    expect(copy.action).toMatch(/turn on/i);
  });

  it("promises nothing it cannot deliver — the work comes before the money", () => {
    const body = pushOfferCopy("ask").body;
    expect(body.indexOf("offers your shop work")).toBeLessThan(body.indexOf("evidence"));
  });

  it("promises a signed-out phone only what an unclaimed phone actually gets", () => {
    // GRIDGO has no idea whose phone this is at the door, so promising job
    // offers there would be a lie. It promises the announcement, and says the
    // rest follows sign-in.
    const copy = pushOfferCopy("ask", false);
    expect(copy.body).toMatch(/new version/i);
    expect(copy.body).toMatch(/once you sign in/i);
    expect(copy.body).not.toMatch(/offers your shop work/i);
  });

  it("asks a blocked phone to open settings rather than promising a dialog", () => {
    expect(pushOfferCopy("settings").action).toMatch(/settings/i);
  });

  it("tells a phone that failed to register that the in-app list still works", () => {
    // Refusal and failure must both leave the app readable as working, because
    // it is: the Alerts tab is the source of truth and push only supplements it.
    expect(pushOfferCopy("retry").body).toMatch(/still arrive in the app/i);
    expect(pushOfferCopy("settings").body).toMatch(/while the app is open/i);
  });
});

describe("the foreground behaviour", () => {
  it("shows nothing — the app is already announcing it twice over", () => {
    // "Do not double-announce": a push is the same record the Alerts tab and
    // its unread badge carry, and `useAlertStream` already toasts a live
    // arrival. A banner on top of that is the same news a third time.
    expect(PUSH_FOREGROUND_BEHAVIOR).toEqual({
      shouldShowBanner: false,
      shouldShowList: false,
      shouldPlaySound: false,
      shouldSetBadge: false,
    });
  });
});
