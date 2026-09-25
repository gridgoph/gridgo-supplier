import { PUSH_PROMPT_REOFFER_MS, pushPromptCopy, shouldOfferPushPrompt } from "@/lib/pushPrompt";

/**
 * When the notifications explainer opens by itself. It is the only path to the
 * Android 13+ permission dialog that a shop does not have to go looking for,
 * so "never" is as much a bug as "every launch".
 */

const NOW = Date.UTC(2026, 8, 25, 2, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

const base = {
  supported: true,
  signedIn: true,
  permission: "undetermined" as const,
  onLanding: true,
  lastOfferedAt: null,
  now: NOW,
};

describe("shouldOfferPushPrompt", () => {
  it("opens the first time a signed-in shop lands on Home — new, or updated from an older build", () => {
    expect(shouldOfferPushPrompt(base)).toBe(true);
  });

  it("stays shut for a week after it last opened, whatever the answer was", () => {
    expect(shouldOfferPushPrompt({ ...base, lastOfferedAt: NOW - 1 * DAY })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, lastOfferedAt: NOW - 6 * DAY })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, lastOfferedAt: NOW - PUSH_PROMPT_REOFFER_MS + 1 })).toBe(false);
  });

  it("opens again once seven days have passed and the phone still says no", () => {
    expect(shouldOfferPushPrompt({ ...base, lastOfferedAt: NOW - 7 * DAY })).toBe(true);
    expect(
      shouldOfferPushPrompt({ ...base, permission: "blocked", lastOfferedAt: NOW - 8 * DAY }),
    ).toBe(true);
  });

  it("never opens on a phone that already allows notifications", () => {
    expect(shouldOfferPushPrompt({ ...base, permission: "granted" })).toBe(false);
  });

  it("waits for the first permission read instead of guessing", () => {
    expect(shouldOfferPushPrompt({ ...base, permission: "unknown" })).toBe(false);
  });

  it("is for a signed-in shop on Home, and only where push can work", () => {
    expect(shouldOfferPushPrompt({ ...base, signedIn: false })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, onLanding: false })).toBe(false);
    expect(shouldOfferPushPrompt({ ...base, supported: false })).toBe(false);
  });

  it("does not let a clock set backwards hold the offer back for good", () => {
    expect(shouldOfferPushPrompt({ ...base, lastOfferedAt: NOW + 30 * DAY })).toBe(true);
  });
});

describe("pushPromptCopy", () => {
  it("asks with the verb the dialog is about", () => {
    expect(pushPromptCopy("undetermined").action).toBe("Turn on notifications");
  });

  it("sends a blocked phone to its settings, and says so", () => {
    const copy = pushPromptCopy("blocked");
    expect(copy.action).toBe("Open phone settings");
    expect(copy.body).toMatch(/phone's settings/);
  });
});
