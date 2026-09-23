import fs from "node:fs";
import path from "node:path";

import { audio } from "@/constants/audio";
import { jobScreenHref } from "@/lib/productionNudge";
import {
  playProductionNudgeSting,
  resetProductionNudgeSounds,
  shouldPlayProductionNudge,
} from "@/lib/nudgeSound";

beforeEach(() => {
  resetProductionNudgeSounds();
});

describe("production reminder sound", () => {
  it("plays only for this type, only when a toast is shown, and only once per id", () => {
    expect(shouldPlayProductionNudge({ type: "shop_job_may_start", id: "ntf_1", toasting: true })).toBe(false);
    expect(shouldPlayProductionNudge({ type: "shop_production_inactive", id: "ntf_1", toasting: false })).toBe(false);
    expect(shouldPlayProductionNudge({ type: "shop_production_inactive", id: "ntf_1", toasting: true })).toBe(true);
    expect(shouldPlayProductionNudge({ type: "shop_production_inactive", id: "ntf_1", toasting: true })).toBe(false);
    expect(shouldPlayProductionNudge({ type: "shop_production_inactive", id: "ntf_2", toasting: true })).toBe(true);
  });

  it("does not throw when this build has no audio module", () => {
    expect(() => playProductionNudgeSting({ type: "shop_production_inactive", id: "ntf_9", toasting: true })).not.toThrow();
  });

  it("names the bundled reminder file", () => {
    expect(typeof audio.nudge).toBe("number");
    const source = fs.readFileSync(path.join(__dirname, "../../constants/audio.ts"), "utf8");
    expect(source).toContain('nudge: require("../assets/audio/notification_alert.mp3")');
  });
});

describe("opening the job", () => {
  it("routes a production reminder to that job", () => {
    expect(jobScreenHref("ord_1")).toEqual({ pathname: "/job/[id]", params: { id: "ord_1" } });
  });
});

describe("notification module", () => {
  it("does not statically import expo-notifications from the reminder path", () => {
    for (const file of [
      "store/push.ts",
      "lib/nudgeSound.ts",
      "lib/brandSound.ts",
      "hooks/usePushNotifications.ts",
      "hooks/useAlertStream.ts",
    ]) {
      const source = fs.readFileSync(path.join(__dirname, "../..", file), "utf8");
      expect(source).not.toMatch(/^import\s+.*expo-notifications/m);
    }
  });
});
