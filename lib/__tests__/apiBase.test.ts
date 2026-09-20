import { hostnameFromHostUri, notificationImageUrl, resolveApiBase } from "@/lib/api";

describe("hostnameFromHostUri", () => {
  it("extracts host from host:port", () => {
    expect(hostnameFromHostUri("192.168.1.55:8081")).toBe("192.168.1.55");
  });

  it("extracts host from exp:// URLs", () => {
    expect(hostnameFromHostUri("exp://192.168.1.55:8081")).toBe("192.168.1.55");
  });

  it("returns null for empty values", () => {
    expect(hostnameFromHostUri(null)).toBeNull();
    expect(hostnameFromHostUri("")).toBeNull();
    expect(hostnameFromHostUri("   ")).toBeNull();
  });
});

describe("resolveApiBase", () => {
  it("uses EXPO_PUBLIC_API_URL when set (explicit override wins, strip trailing slash)", () => {
    expect(
      resolveApiBase({
        envUrl: "https://api.example.com/",
        envPort: "9999",
        hostCandidates: ["192.168.1.55:8081"],
        platformOS: "android",
      }),
    ).toBe("https://api.example.com");
  });

  it("ignores blank EXPO_PUBLIC_API_URL and falls through", () => {
    expect(
      resolveApiBase({
        envUrl: "   ",
        hostCandidates: ["192.168.1.55:8081"],
        platformOS: "ios",
      }),
    ).toBe("http://192.168.1.55:8787");
  });

  it("Expo Go on a LAN phone: uses the dev-server hostname with the API port", () => {
    expect(
      resolveApiBase({
        hostCandidates: ["192.168.1.55:8081"],
        platformOS: "android",
        envPort: "8787",
      }),
    ).toBe("http://192.168.1.55:8787");
  });

  it("Android emulator: remaps loopback host to 10.0.2.2", () => {
    expect(
      resolveApiBase({
        hostCandidates: ["localhost:8081"],
        platformOS: "android",
        isDevice: false,
      }),
    ).toBe("http://10.0.2.2:8787");

    expect(
      resolveApiBase({
        hostCandidates: ["127.0.0.1:8081"],
        platformOS: "android",
        isDevice: false,
      }),
    ).toBe("http://10.0.2.2:8787");
  });

  it("Android USB phone: uses IPv4 loopback so a reverse reaches GRIDGO on any Wi-Fi", () => {
    expect(
      resolveApiBase({
        hostCandidates: ["localhost:8082"],
        platformOS: "android",
        isDevice: true,
      }),
    ).toBe("http://127.0.0.1:8787");
  });

  it("Android loopback defaults to USB IPv4 when device kind is unknown", () => {
    expect(
      resolveApiBase({
        hostCandidates: ["localhost:8082"],
        platformOS: "android",
      }),
    ).toBe("http://127.0.0.1:8787");
  });

  it("iOS simulator: keeps localhost (no 10.0.2.2 remap)", () => {
    expect(
      resolveApiBase({
        hostCandidates: ["localhost:8081"],
        platformOS: "ios",
      }),
    ).toBe("http://localhost:8787");
  });

  it("falls back to 127.0.0.1 when no Expo host is available", () => {
    expect(
      resolveApiBase({
        hostCandidates: [null, undefined, ""],
        platformOS: "android",
      }),
    ).toBe("http://127.0.0.1:8787");
  });

  it("honours EXPO_PUBLIC_API_PORT for derived hosts", () => {
    expect(
      resolveApiBase({
        hostCandidates: ["10.0.0.4:8081"],
        envPort: "9000",
        platformOS: "ios",
      }),
    ).toBe("http://10.0.0.4:9000");
  });

  /**
   * A hosted build is configuration, not code: `EXPO_PUBLIC_API_URL` is set at
   * build time and nothing else may win. These pin the two ways that could
   * quietly break — a dev-server hostname leaking into a shipped binary, and a
   * store build with no hostUri at all falling back to loopback.
   */
  it("a production build points at its own domain over https, on both platforms", () => {
    for (const platformOS of ["ios", "android"] as const) {
      expect(
        resolveApiBase({
          envUrl: "https://api.example.com",
          hostCandidates: [],
          platformOS,
        }),
      ).toBe("https://api.example.com");
    }
  });

  it("never falls back to the dev server or loopback while that variable is set", () => {
    const base = resolveApiBase({
      envUrl: "https://api.example.com",
      envPort: "8787",
      // A build run from a developer's machine still carries these.
      hostCandidates: ["192.168.1.55:8081", "localhost:8081"],
      platformOS: "android",
    });

    expect(base).toBe("https://api.example.com");
    expect(base).not.toContain("10.0.2.2");
    expect(base).not.toContain("127.0.0.1");
    expect(base).not.toContain("8787");
  });

  it("keeps a path prefix, so the API can live under one", () => {
    expect(
      resolveApiBase({ envUrl: "https://example.com/gridgo/", hostCandidates: [] }),
    ).toBe("https://example.com/gridgo");
  });

  it("walks host candidates until one parses", () => {
    expect(
      resolveApiBase({
        hostCandidates: [null, "", "exp://10.20.30.40:19000"],
        platformOS: "ios",
      }),
    ).toBe("http://10.20.30.40:8787");
  });

  it("on web uses the page host so *.localhost isolation can reach the API", () => {
    expect(
      resolveApiBase({
        hostCandidates: ["localhost:8082"],
        platformOS: "web",
        pageHostname: "supplier.localhost",
      }),
    ).toBe("http://supplier.localhost:8787");
  });
});

describe("notificationImageUrl", () => {
  it("leaves a public picture link alone and ignores blanks", () => {
    expect(notificationImageUrl("https://cdn.gridgo.example/update.png")).toBe(
      "https://cdn.gridgo.example/update.png",
    );
    expect(notificationImageUrl("  ")).toBeNull();
    expect(notificationImageUrl(undefined)).toBeNull();
  });
});
