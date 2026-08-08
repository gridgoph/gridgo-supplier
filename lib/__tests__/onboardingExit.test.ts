import { resolveOnboardingExit } from "@/lib/onboardingExit";

describe("resolveOnboardingExit", () => {
  it("returns to Settings when replayed from Settings", () => {
    expect(resolveOnboardingExit("settings", true)).toBe("settings");
    expect(resolveOnboardingExit("settings", false)).toBe("settings");
  });

  it("goes back when launched with history and no settings flag", () => {
    expect(resolveOnboardingExit(undefined, true)).toBe("back");
    expect(resolveOnboardingExit("other", true)).toBe("back");
  });

  it("falls back to the launcher when there is no history", () => {
    expect(resolveOnboardingExit(undefined, false)).toBe("launcher");
  });
});
