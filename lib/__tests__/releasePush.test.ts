import { Linking } from "react-native";
import { installChannel } from "../buildDistribution";
import { belongsToInstall, openRelease, releaseNoticeChannel, releaseNoticeOpen } from "../releasePush";

const APK = "https://gridgo.talasora.com/downloads/gridgo-supplier.apk";
const legacyTitle = "GRIDGO Supplier 1.0.123 is ready";
const notice = (releaseChannel: string, storeTarget: string) => ({ type: "announcement", releaseChannel, storeTarget });

describe("installChannel", () => {
  it("reports ios on every iPhone build, play on the Play bundle and apk otherwise", () => {
    expect(installChannel("ios", "sideload")).toBe("ios");
    expect(installChannel("ios", "play")).toBe("ios");
    expect(installChannel("android", "play")).toBe("play");
    expect(installChannel("android", "sideload")).toBe("apk");
    expect(installChannel("web", "sideload")).toBeNull();
  });
});

describe("releaseNoticeOpen", () => {
  it("opens the APK download only on an APK install", () => {
    expect(releaseNoticeOpen(notice("apk", "apk_download"), "anything", "apk")).toEqual({ target: "apk_download", url: APK });
    expect(releaseNoticeOpen(notice("apk", "apk_download"), legacyTitle, "play")).toBeNull();
    expect(releaseNoticeOpen(notice("apk", "apk_download"), legacyTitle, "ios")).toBeNull();
  });

  it("opens this app's Play listing from a Play notice on a Play install", () => {
    expect(releaseNoticeOpen(notice("play", "play_store"), "GRIDGO Supplier 1.0.123 is on the Play Store", "play")).toEqual({
      target: "play_store",
      url: "market://details?id=ph.gridgo.supplier",
      fallback: "https://play.google.com/store/apps/details?id=ph.gridgo.supplier",
    });
  });

  it("opens TestFlight from a TestFlight notice on an iPhone", () => {
    expect(releaseNoticeOpen(notice("ios", "testflight"), "GRIDGO Supplier 1.0.123 is in TestFlight", "ios")).toEqual({
      target: "testflight",
      url: "itms-beta://",
      fallback: "https://apps.apple.com/app/testflight/id899247664",
    });
  });

  it("leaves another channel's notice, a mismatched pair and an unknown target to the inbox", () => {
    expect(releaseNoticeOpen(notice("play", "play_store"), null, "apk")).toBeNull();
    expect(releaseNoticeOpen(notice("ios", "testflight"), null, "play")).toBeNull();
    expect(releaseNoticeOpen(notice("play", "apk_download"), null, "play")).toBeNull();
    expect(releaseNoticeOpen(notice("apk", "website"), legacyTitle, "apk")).toBeNull();
    expect(releaseNoticeOpen({ type: "announcement", storeTarget: "play_store" }, null, "play")).toBeNull();
    expect(releaseNoticeOpen(notice("play", "play_store"), null, null)).toBeNull();
  });

  it("keeps the title match for notices sent before channels, on an APK install only", () => {
    expect(releaseNoticeOpen({ type: "announcement" }, legacyTitle, "apk")).toEqual({ target: "apk_download", url: APK });
    expect(releaseNoticeOpen({ type: "announcement" }, legacyTitle, "play")).toBeNull();
    expect(releaseNoticeOpen({ type: "announcement" }, legacyTitle, "ios")).toBeNull();
    for (const title of ["Hello", "GRIDGO Other 1.0.123 is ready", "GRIDGO Supplier https://example.com is ready", ` ${legacyTitle}`, null]) {
      expect(releaseNoticeOpen({ type: "announcement" }, title, "apk")).toBeNull();
    }
    expect(releaseNoticeOpen({ type: "order_updated" }, legacyTitle, "apk")).toBeNull();
  });
});

describe("releaseNoticeChannel", () => {
  it("reads the channel GRIDGO names, or the store target's when only that is sent", () => {
    expect(releaseNoticeChannel(notice("ios", "testflight"), null)).toBe("ios");
    expect(releaseNoticeChannel(notice("play", "play_store"), null)).toBe("play");
    expect(releaseNoticeChannel({ type: "announcement", storeTarget: "testflight" }, null)).toBe("ios");
  });

  it("counts a notice from before channels as an APK notice", () => {
    expect(releaseNoticeChannel({ type: "announcement" }, legacyTitle)).toBe("apk");
  });

  it("is not a release notice otherwise", () => {
    expect(releaseNoticeChannel({ type: "announcement" }, "Holiday hours")).toBeNull();
    expect(releaseNoticeChannel({ type: "order_updated" }, legacyTitle)).toBeNull();
    expect(releaseNoticeChannel(null, legacyTitle)).toBeNull();
  });
});

describe("belongsToInstall", () => {
  const tf = { ...notice("ios", "testflight"), title: "GRIDGO Supplier 1.0.5 is in TestFlight" };
  const legacy = { type: "announcement", title: legacyTitle };

  it("keeps every release notice to its own channel, the tap included", () => {
    for (const channel of ["apk", "play", "ios"] as const) {
      expect(belongsToInstall(tf, channel)).toBe(channel === "ios");
      expect(belongsToInstall(legacy, channel)).toBe(channel === "apk");
      // What the inbox shows is what a tap can act on.
      if (belongsToInstall(tf, channel)) expect(releaseNoticeOpen(tf, tf.title, channel)).not.toBeNull();
      if (belongsToInstall(legacy, channel)) expect(releaseNoticeOpen(legacy, legacy.title, channel)).not.toBeNull();
    }
  });

  it("keeps every other notice on every install", () => {
    expect(belongsToInstall({ type: "announcement", title: "Holiday hours" }, "ios")).toBe(true);
    expect(belongsToInstall({ type: "shop_job_assigned", title: legacyTitle }, null)).toBe(true);
  });
});

describe("openRelease", () => {
  beforeEach(() => jest.clearAllMocks());
  afterEach(() => jest.restoreAllMocks());

  it("falls back to the web page when the store app is missing", async () => {
    const open = jest.spyOn(Linking, "openURL").mockRejectedValueOnce(new Error("no handler")).mockResolvedValue(undefined);
    await openRelease({ target: "play_store", url: "market://x", fallback: "https://x" });
    expect(open.mock.calls).toEqual([["market://x"], ["https://x"]]);
  });

  it("opens the store app when it is there", async () => {
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await openRelease({ target: "testflight", url: "itms-beta://", fallback: "https://y" });
    expect(open.mock.calls).toEqual([["itms-beta://"]]);
  });
});
