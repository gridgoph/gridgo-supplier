import {
  CHECK_TIMEOUT_MS,
  FOREGROUND_CHECK_INTERVAL_MS,
  LATEST_RELEASE_URL,
  completedUpdate,
  fetchLatestRelease,
  formatDownloadSize,
  installedBuild,
  parseLatestRelease,
  parseReleaseTag,
  shouldCheck,
  shouldOffer,
} from "@/lib/appUpdate";

/** The shape GitHub returned for v1.0.84, trimmed to what is read. */
const RELEASE = {
  tag_name: "v1.0.84",
  name: "GRIDGO Supplier 1.0.84",
  draft: false,
  prerelease: false,
  published_at: "2026-09-23T13:15:55Z",
  assets: [
    {
      name: "gridgo-supplier-1.0.84-6ebc8bf.apk",
      size: 130409988,
    },
  ],
};

describe("parseReleaseTag", () => {
  it("reads the run number off the tag CI creates", () => {
    expect(parseReleaseTag("v1.0.84")).toEqual({ versionCode: 84, versionName: "1.0.84" });
    expect(parseReleaseTag("1.2.301")).toEqual({ versionCode: 301, versionName: "1.2.301" });
  });

  it.each([undefined, null, 84, "", "v1.0", "latest", "v1.0.84-beta", "v1.0.0"])(
    "refuses %p",
    (tag) => {
      expect(parseReleaseTag(tag)).toBeNull();
    },
  );
});

describe("parseLatestRelease", () => {
  it("keeps the version, the date and the APK's size", () => {
    expect(parseLatestRelease(RELEASE)).toEqual({
      versionCode: 84,
      versionName: "1.0.84",
      publishedAt: "2026-09-23T13:15:55Z",
      apkBytes: 130409988,
    });
  });

  it("still offers a release with no APK asset or date", () => {
    expect(parseLatestRelease({ tag_name: "v1.0.90" })).toEqual({
      versionCode: 90,
      versionName: "1.0.90",
      publishedAt: null,
      apkBytes: null,
    });
  });

  it("ignores drafts, prereleases and anything that is not a release", () => {
    expect(parseLatestRelease({ ...RELEASE, draft: true })).toBeNull();
    expect(parseLatestRelease({ ...RELEASE, prerelease: true })).toBeNull();
    // GitHub's rate-limit body.
    expect(parseLatestRelease({ message: "API rate limit exceeded" })).toBeNull();
    expect(parseLatestRelease(null)).toBeNull();
    expect(parseLatestRelease("v1.0.84")).toBeNull();
  });
});

describe("fetchLatestRelease", () => {
  it("asks the public releases endpoint", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, json: async () => RELEASE }));
    await expect(fetchLatestRelease(fetchImpl)).resolves.toMatchObject({ versionCode: 84 });
    expect(fetchImpl).toHaveBeenCalledWith(
      LATEST_RELEASE_URL,
      expect.objectContaining({ headers: { Accept: "application/vnd.github+json" } }),
    );
  });

  it("is silent when rate-limited", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      json: async () => ({ message: "API rate limit exceeded" }),
    }));
    await expect(fetchLatestRelease(fetchImpl)).resolves.toBeNull();
  });

  it("is silent offline", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(fetchLatestRelease(fetchImpl)).resolves.toBeNull();
  });

  it("is silent on a body that is not JSON", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));
    await expect(fetchLatestRelease(fetchImpl)).resolves.toBeNull();
  });

  it("gives up on a check that never answers", async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(
        (_url: string, init: { signal?: AbortSignal }) =>
          new Promise<never>((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      );
      const pending = fetchLatestRelease(fetchImpl);
      jest.advanceTimersByTime(CHECK_TIMEOUT_MS);
      await expect(pending).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("installedBuild", () => {
  const release = { versionCode: 80, versionName: "1.0.80", releaseBuild: true, dev: false };

  it("reads a CI-stamped release build", () => {
    expect(installedBuild(release)).toEqual({ versionCode: 80, versionName: "1.0.80" });
  });

  it("skips development builds and Expo Go", () => {
    expect(installedBuild({ ...release, versionCode: 1, releaseBuild: false, dev: true })).toBeNull();
  });

  it("skips a release built without a build number", () => {
    expect(installedBuild({ ...release, versionCode: 1, versionName: "1.0.0" })).toBeNull();
  });

  it("lets development pretend to be an older build", () => {
    expect(
      installedBuild({
        versionCode: 1,
        versionName: "1.0.0",
        releaseBuild: false,
        dev: true,
        forceVersionCode: "1",
      }),
    ).toEqual({ versionCode: 1, versionName: "1.0.1" });
  });

  it("ignores the override outside development", () => {
    expect(installedBuild({ ...release, forceVersionCode: "1" })).toEqual({
      versionCode: 80,
      versionName: "1.0.80",
    });
  });

  it("ignores an override that is not a whole number", () => {
    expect(
      installedBuild({
        versionCode: 1,
        versionName: "1.0.0",
        releaseBuild: false,
        dev: true,
        forceVersionCode: "yes",
      }),
    ).toBeNull();
  });
});

describe("shouldCheck", () => {
  const now = Date.parse("2026-09-24T09:00:00+08:00");

  it("always checks at launch", () => {
    expect(shouldCheck("launch", now - 1000, now)).toBe(true);
  });

  it("waits out the interval on a return to the foreground", () => {
    expect(shouldCheck("foreground", now - FOREGROUND_CHECK_INTERVAL_MS + 1, now)).toBe(false);
    expect(shouldCheck("foreground", now - FOREGROUND_CHECK_INTERVAL_MS, now)).toBe(true);
    expect(shouldCheck("foreground", null, now)).toBe(true);
  });
});

describe("shouldOffer", () => {
  const installed = { versionCode: 80, versionName: "1.0.80" };
  const latest = { versionCode: 84, versionName: "1.0.84" };

  it("offers a newer build", () => {
    expect(shouldOffer(installed, latest, null, "2026-09-24")).toBe(true);
  });

  it("never offers the same or an older build", () => {
    expect(shouldOffer(installed, installed, null, "2026-09-24")).toBe(false);
    expect(shouldOffer(latest, installed, null, "2026-09-24")).toBe(false);
  });

  it("stays quiet for a version put off today, and asks again tomorrow", () => {
    const snooze = { versionCode: 84, dayKey: "2026-09-24" };
    expect(shouldOffer(installed, latest, snooze, "2026-09-24")).toBe(false);
    expect(shouldOffer(installed, latest, snooze, "2026-09-25")).toBe(true);
  });

  it("asks about a still newer version the same day", () => {
    const snooze = { versionCode: 84, dayKey: "2026-09-24" };
    expect(
      shouldOffer(installed, { versionCode: 85, versionName: "1.0.85" }, snooze, "2026-09-24"),
    ).toBe(true);
  });
});

describe("completedUpdate", () => {
  const installed = { versionCode: 84, versionName: "1.0.84" };

  it("says so on the first launch of a newer build", () => {
    expect(completedUpdate(80, installed)).toBe(true);
  });

  it("says nothing on a first install or a relaunch", () => {
    expect(completedUpdate(null, installed)).toBe(false);
    expect(completedUpdate(84, installed)).toBe(false);
  });
});

describe("formatDownloadSize", () => {
  it("counts decimal megabytes, as Android does", () => {
    expect(formatDownloadSize(130409988)).toBe("130 MB");
    expect(formatDownloadSize(400_000)).toBe("Under 1 MB");
    expect(formatDownloadSize(null)).toBeNull();
    expect(formatDownloadSize(0)).toBeNull();
  });
});
