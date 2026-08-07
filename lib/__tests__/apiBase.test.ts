import { hostnameFromHostUri, resolveApiBase } from "@/lib/api";

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
      }),
    ).toBe("http://10.0.2.2:8787");

    expect(
      resolveApiBase({
        hostCandidates: ["127.0.0.1:8081"],
        platformOS: "android",
      }),
    ).toBe("http://10.0.2.2:8787");
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

  it("walks host candidates until one parses", () => {
    expect(
      resolveApiBase({
        hostCandidates: [null, "", "exp://10.20.30.40:19000"],
        platformOS: "ios",
      }),
    ).toBe("http://10.20.30.40:8787");
  });
});
