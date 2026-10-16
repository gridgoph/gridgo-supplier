import { Linking } from "react-native";
import { installChannel } from "../buildDistribution";
import { openRelease, releaseNoticeOpen } from "../releasePush";

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
