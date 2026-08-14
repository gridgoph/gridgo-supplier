import {
  appForGridgoRole,
  clerkAccessFor,
  clerkPublishableKey,
  resolveClerkPublishableKey,
} from "@/lib/clerk";

describe("clerkAccessFor", () => {
  it("opens this binary only for server-written supplier metadata", () => {
    expect(clerkAccessFor({ gridgoRole: "supplier" })).toEqual({
      kind: "supplier",
    });
  });

  it("keeps a Clerk identity with no assigned role out of supplier routes", () => {
    for (const metadata of [undefined, null, {}, { gridgoRole: "" }]) {
      expect(clerkAccessFor(metadata)).toEqual({ kind: "unassigned" });
    }
  });

  it("hands known non-supplier roles to the app people recognize", () => {
    expect(clerkAccessFor({ gridgoRole: "client" })).toEqual({
      kind: "mismatch",
      destination: "GRIDGO for clients",
    });
    expect(clerkAccessFor({ gridgoRole: "rider" })).toEqual({
      kind: "mismatch",
      destination: "GRIDGO Rider",
    });
    expect(clerkAccessFor({ gridgoRole: "ops_admin" })).toEqual({
      kind: "mismatch",
      destination: "the GRIDGO Operations portal",
    });
    expect(clerkAccessFor({ gridgoRole: "super_admin" })).toEqual({
      kind: "mismatch",
      destination: "the GRIDGO Operations portal",
    });
  });

  it("fails closed for malformed or unknown metadata", () => {
    for (const metadata of [
      { gridgoRole: "SUPPLIER" },
      { gridgoRole: "shop" },
      { gridgoRole: ["supplier"] },
      { gridgoRole: { value: "supplier" } },
    ]) {
      expect(clerkAccessFor(metadata)).toEqual({ kind: "unassigned" });
    }
  });
});

describe("appForGridgoRole", () => {
  it("never exposes platform role strings in app copy", () => {
    expect(appForGridgoRole("client")).toBe("GRIDGO for clients");
    expect(appForGridgoRole("rider")).toBe("GRIDGO Rider");
    expect(appForGridgoRole("ops_admin")).toBe("the GRIDGO Operations portal");
    expect(appForGridgoRole("super_admin")).toBe("the GRIDGO Operations portal");
  });
});

describe("clerkPublishableKey", () => {
  const testKey = "pk_test_Y2FzdWFsLWNyYWItOS5jbGVyay5hY2NvdW50cy5kZXYk";
  const liveKey = "pk_live_Z3JpZGdvLmV4YW1wbGUuY29tJA";

  it("accepts a development publishable key only in development", () => {
    expect(clerkPublishableKey(testKey, true)).toBe(testKey);
    expect(() => clerkPublishableKey(testKey, false)).toThrow(/pk_live_/);
  });

  it("accepts a live publishable key in every build", () => {
    expect(clerkPublishableKey(liveKey, true)).toBe(liveKey);
    expect(clerkPublishableKey(liveKey, false)).toBe(liveKey);
  });

  it("rejects missing, malformed, and secret keys", () => {
    for (const value of [undefined, null, "", "clerk", "sk_test_do-not-ship"]) {
      expect(() => clerkPublishableKey(value, true)).toThrow();
    }
  });

  it("prefers extra and falls back to the static env read", () => {
    const original = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
    process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = liveKey;
    try {
      expect(resolveClerkPublishableKey(testKey, true)).toBe(testKey);
      expect(resolveClerkPublishableKey("", false)).toBe(liveKey);
      expect(resolveClerkPublishableKey(undefined, false)).toBe(liveKey);
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
      else process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = original;
    }
  });

  it("does not embed the env identifier in operator-facing errors", () => {
    const messages: string[] = [];
    for (const [value, development] of [
      ["", true],
      [testKey, false],
    ] as const) {
      try {
        clerkPublishableKey(value, development);
      } catch (error) {
        messages.push(error instanceof Error ? error.message : String(error));
      }
    }
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message).not.toContain("EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY");
    }
  });
});
