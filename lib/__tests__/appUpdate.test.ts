import {
  CHECK_TIMEOUT_MS,
  FOREGROUND_CHECK_INTERVAL_MS,
  LATEST_RELEASE_URL,
  USER_AGENT,
  completedUpdate,
  describeInstalledBuild,
  describeOffer,
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
  it("asks the public releases endpoint, naming itself", async () => {
    const fetchImpl = jest.fn(async () => ({ ok: true, status: 200, json: async () => RELEASE }));
    await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual({
      latest: expect.objectContaining({ versionCode: 84 }),
      answered: true,
      detail: "latest release is 1.0.84",
    });
    // GitHub answers a request with no User-Agent 403, the same status as its
    // rate limit — so the check could not tell the two apart.
    expect(fetchImpl).toHaveBeenCalledWith(
      LATEST_RELEASE_URL,
      expect.objectContaining({
        headers: { Accept: "application/vnd.github+json", "User-Agent": USER_AGENT },
      }),
    );
    expect(USER_AGENT).toBe("GRIDGO-supplier");
  });

  it("is silent when rate-limited, and says which status came back", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: false,
      status: 403,
      json: async () => ({ message: "API rate limit exceeded" }),
    }));
    await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual({
      latest: null,
      answered: true,
      detail: "GitHub answered HTTP 403",
    });
  });

  it("is silent offline, and counts it as unanswered", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual({
      latest: null,
      answered: false,
      detail: "no answer (Network request failed)",
    });
  });

  it("is silent on a body that is not JSON", async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError("Unexpected token <");
      },
    }));
    await expect(fetchLatestRelease(fetchImpl)).resolves.toEqual({
      latest: null,
      answered: true,
      detail: "unreadable release body (Unexpected token <)",
    });
  });

  it("names a tag that is not a CI release, and a release that is not final", async () => {
    const tagged = (body: unknown) =>
      fetchLatestRelease(jest.fn(async () => ({ ok: true, status: 200, json: async () => body })));
    await expect(tagged({ tag_name: "nightly" })).resolves.toMatchObject({
      latest: null,
      detail: 'tag "nightly" is not a CI release',
    });
    await expect(tagged({ ...RELEASE, prerelease: true })).resolves.toMatchObject({
      latest: null,
      detail: 'release "v1.0.84" is not final',
    });
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
      await expect(pending).resolves.toEqual({
        latest: null,
        answered: false,
        detail: "no answer (aborted)",
      });
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

describe("describeInstalledBuild", () => {
  const expoGo = {
    versionCode: 1,
    versionName: "1.0.0",
    releaseBuild: false,
    dev: true,
    expoGo: true,
  };

  it("says the override reached the bundle", () => {
    const input = { ...expoGo, forceVersionCode: "90" };
    expect(describeInstalledBuild(input, installedBuild(input))).toBe(
      "installed 1.0.90 (versionCode 90, forced by override)",
    );
  });

  it("says when it did not", () => {
    expect(describeInstalledBuild(expoGo, installedBuild(expoGo))).toBe(
      "off: Expo Go and EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set",
    );
    const dev = { ...expoGo, expoGo: false };
    expect(describeInstalledBuild(dev, null)).toBe(
      "off: development build and EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set",
    );
  });

  it("names an override it could not read", () => {
    const input = { ...expoGo, forceVersionCode: "yes" };
    expect(describeInstalledBuild(input, installedBuild(input))).toBe(
      'off: EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE="yes" is not a whole number above 0',
    );
  });

  it("describes a release build, and one CI did not stamp", () => {
    const release = { versionCode: 80, versionName: "1.0.80", releaseBuild: true, dev: false };
    expect(describeInstalledBuild(release, installedBuild(release))).toBe(
      "installed 1.0.80 (versionCode 80, release build)",
    );
    const local = { ...release, versionCode: 1, versionName: "1.0.0" };
    expect(describeInstalledBuild(local, installedBuild(local))).toBe(
      "off: versionCode 1 is not a CI release",
    );
  });
});

describe("describeOffer", () => {
  const installed = { versionCode: 90, versionName: "1.0.90" };
  const latest = { versionCode: 95, versionName: "1.0.95" };

  it("says what it offered and why it did not", () => {
    expect(describeOffer(installed, latest, null, "2026-09-24")).toBe(
      "offering 1.0.95 over 1.0.90",
    );
    expect(describeOffer(latest, latest, null, "2026-09-24")).toBe(
      "not offering: 1.0.95 is already the latest",
    );
    expect(
      describeOffer(installed, latest, { versionCode: 95, dayKey: "2026-09-24" }, "2026-09-24"),
    ).toBe('not offering 1.0.95: "Later" was tapped for 95 on 2026-09-24');
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
