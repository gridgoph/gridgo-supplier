import {
  bundledNotesFor,
  compareVersionsDesc,
  fetchReleaseHistory,
  mergeHistory,
  parseReleaseList,
  readBundledHistory,
  releaseAccessibilityLabel,
  releaseKindOf,
  releasePlace,
  RELEASE_LABEL_LOOK,
  RELEASE_LABELS,
  RELEASE_LIST_URL,
  type ReleaseNotes,
} from "@/lib/whatsNewHistory";

// Every fixture is written here; nothing reads the repository's own notes,
// which CI rewrites on each release.

function release(version: string, kind: ReleaseNotes["kind"], notes = [`Notes for ${version}`]) {
  return { version, kind, notes };
}

function response(status: number, body: unknown) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response;
}

describe("ordering", () => {
  it("puts the newest version first, reading the run number as a number", () => {
    const sorted = ["1.0.99", "1.0.100", "1.0.9", "1.1.2"].sort(compareVersionsDesc);
    expect(sorted).toEqual(["1.1.2", "1.0.100", "1.0.99", "1.0.9"]);
  });

  it("orders the bundled history newest first whatever order it arrives in", () => {
    const history = readBundledHistory([
      release("1.0.128", "feature"),
      release("1.0.171", "fix"),
      release("1.0.143", "feature"),
    ]);
    expect(history.map((entry) => entry.version)).toEqual(["1.0.171", "1.0.143", "1.0.128"]);
  });
});

describe("the bundled history", () => {
  it("drops what it cannot show instead of failing the page", () => {
    expect(readBundledHistory(undefined)).toEqual([]);
    expect(readBundledHistory("1.0.1")).toEqual([]);
    expect(
      readBundledHistory([
        null,
        { version: "latest", kind: "fix", notes: ["x"] },
        { version: "1.0.5", kind: "fix", notes: [] },
        { version: "1.0.6", kind: "fix", notes: [" ", 7] },
        { version: "1.0.7", kind: "fix", notes: [" Kept "] },
      ]),
    ).toEqual([release("1.0.7", "fix", ["Kept"])]);
  });

  it("keeps a release whose label this build does not know, without a label", () => {
    expect(readBundledHistory([release("1.0.9", "beta" as never)])).toEqual([release("1.0.9", null)]);
  });
});

describe("release labels", () => {
  it("reads the codes and the words the release job writes", () => {
    expect(releaseKindOf("feature")).toBe("feature");
    expect(releaseKindOf("New feature")).toBe("feature");
    expect(releaseKindOf(" improvement ")).toBe("improvement");
    expect(releaseKindOf("Fix")).toBe("fix");
    expect(releaseKindOf("Major")).toBeNull();
    expect(releaseKindOf(undefined)).toBeNull();
  });

  it("are a small plain set, each with an icon as well as a colour", () => {
    expect(Object.values(RELEASE_LABELS)).toEqual(["New feature", "Improvement", "Fix"]);
    for (const look of Object.values(RELEASE_LABEL_LOOK)) expect(look.icon).toBeTruthy();
  });

  it("are read aloud with the version and where it stands", () => {
    expect(releaseAccessibilityLabel(release("1.0.9", "fix", ["A", "B"]), "installed")).toBe(
      "Version 1.0.9, Fix, On this phone. A. B",
    );
    expect(releaseAccessibilityLabel(release("1.0.9", null, ["A"]), null)).toBe("Version 1.0.9. A");
  });
});

describe("the GitHub releases list", () => {
  const body = (label: string | null, notes: string[]) =>
    [
      "## What's new",
      "",
      ...(label ? [`Release type: ${label}`, ""] : []),
      ...notes.map((note) => `- ${note}`),
      "",
      "## Build",
      "",
      "Release type: not this one",
    ].join("\n");

  it("keeps final CI releases with notes, labelled from their body, newest first", () => {
    const list = parseReleaseList([
      { tag_name: "v1.0.170", body: body("New feature", ["Added"]) },
      { tag_name: "v1.0.180", body: body("Fix", ["Mended"]) },
      { tag_name: "v1.0.160", body: body(null, ["Older, unlabelled"]) },
      { tag_name: "v1.0.190", body: body("Fix", ["Draft"]), draft: true },
      { tag_name: "v1.0.191", body: body("Fix", ["Beta"]), prerelease: true },
      { tag_name: "nightly", body: body("Fix", ["Not CI"]) },
      { tag_name: "v1.0.150", body: "## Build\n\nNo notes" },
    ]);
    expect(list).toEqual([
      release("1.0.180", "fix", ["Mended"]),
      release("1.0.170", "feature", ["Added"]),
      release("1.0.160", null, ["Older, unlabelled"]),
    ]);
  });

  it("is read from the same repository as the update prompt", () => {
    expect(RELEASE_LIST_URL).toBe(
      "https://api.github.com/repos/gridgoph/gridgo-supplier/releases?per_page=30",
    );
  });
});

describe("merging", () => {
  it("adds only releases the build does not carry, and the bundled one stands", () => {
    const bundled = [release("1.0.171", "fix", ["Bundled"]), release("1.0.166", "fix")];
    const online = [
      release("1.0.180", "feature"),
      release("1.0.171", null, ["Online copy"]),
      release("1.0.174", "improvement"),
    ];
    const merged = mergeHistory(bundled, online);
    expect(merged.map((entry) => entry.version)).toEqual(["1.0.180", "1.0.174", "1.0.171", "1.0.166"]);
    expect(merged[2]).toEqual(release("1.0.171", "fix", ["Bundled"]));
  });
});

describe("where a release stands against this phone", () => {
  it("marks the installed build, newer and older ones", () => {
    expect(releasePlace("1.0.171", "1.0.171")).toBe("installed");
    expect(releasePlace("1.0.180", "1.0.171")).toBe("newer");
    expect(releasePlace("1.0.99", "1.0.171")).toBe("older");
  });

  it("marks nothing when the phone is not a release build", () => {
    expect(releasePlace("1.0.171", null)).toBeNull();
  });
});

describe("reading the list online", () => {
  it("answers the releases", async () => {
    const fetchImpl = jest.fn(async () =>
      response(200, [{ tag_name: "v1.0.9", body: "## What's new\n\nRelease type: Fix\n\n- Mended" }]),
    );
    await expect(fetchReleaseHistory(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      releases: [release("1.0.9", "fix", ["Mended"])],
      outcome: "online",
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      RELEASE_LIST_URL,
      expect.objectContaining({ headers: expect.objectContaining({ "User-Agent": "GRIDGO-supplier" }) }),
    );
  });

  it("is offline when nothing answers", async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError("Network request failed");
    });
    await expect(fetchReleaseHistory(fetchImpl as unknown as typeof fetch)).resolves.toEqual({
      releases: [],
      outcome: "offline",
    });
  });

  it("is unavailable when GitHub answers something else, such as its rate limit", async () => {
    const limited = jest.fn(async () => response(403, { message: "rate limit" }));
    await expect(fetchReleaseHistory(limited as unknown as typeof fetch)).resolves.toMatchObject({
      outcome: "unavailable",
    });
    const odd = jest.fn(async () => response(200, { message: "not a list" }));
    await expect(fetchReleaseHistory(odd as unknown as typeof fetch)).resolves.toMatchObject({
      outcome: "unavailable",
    });
  });
});

describe("the notes for the build on this phone", () => {
  it("are the bundled notes for that version, or nothing", () => {
    const bundled = [release("1.0.12", "feature", ["Now"]), release("1.0.9", "fix", ["Before"])];
    expect(bundledNotesFor(bundled, "1.0.12")).toEqual(["Now"]);
    expect(bundledNotesFor(bundled, "1.0.13")).toEqual([]);
  });
});
