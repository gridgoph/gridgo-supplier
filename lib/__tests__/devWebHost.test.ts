import { GRIDGO_DEV_WEB_HOST, isolatedDevWebHref } from "@/lib/devWebHost";

function loc(hostname: string, port = "8082") {
  return {
    protocol: "http:",
    hostname,
    port,
    pathname: "/access",
    search: "",
    hash: "",
  };
}

describe("isolatedDevWebHref", () => {
  it("keeps this app on its own Clerk cookie host", () => {
    expect(GRIDGO_DEV_WEB_HOST).toBe("supplier.localhost");
    expect(isolatedDevWebHref(loc("localhost"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://supplier.localhost:8082/access",
    );
    expect(isolatedDevWebHref(loc("127.0.0.1"), GRIDGO_DEV_WEB_HOST)).toBe(
      "http://supplier.localhost:8082/access",
    );
  });

  it("does not bounce an already-isolated or LAN origin", () => {
    expect(isolatedDevWebHref(loc(GRIDGO_DEV_WEB_HOST), GRIDGO_DEV_WEB_HOST)).toBeNull();
    expect(isolatedDevWebHref(loc("192.168.80.49"), GRIDGO_DEV_WEB_HOST)).toBeNull();
  });
});
