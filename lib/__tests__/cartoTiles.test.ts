import { cartoApiKey, cartoDarkTileUrl } from "@/lib/cartoTiles";

describe("cartoDarkTileUrl", () => {
  it("leaves dark tiles keyless when no key is configured", () => {
    expect(cartoApiKey("")).toBeNull();
    expect(cartoDarkTileUrl("")).not.toMatch(/key=/);
  });

  it("appends the Carto key as the documented query param", () => {
    expect(cartoDarkTileUrl("test-key_1")).toContain("?key=test-key_1");
  });

  it("reads the default path from EXPO_PUBLIC_CARTO_API_KEY", () => {
    const original = process.env.EXPO_PUBLIC_CARTO_API_KEY;
    try {
      process.env.EXPO_PUBLIC_CARTO_API_KEY = "probe-from-env";
      expect(cartoDarkTileUrl()).toContain("?key=probe-from-env");

      delete process.env.EXPO_PUBLIC_CARTO_API_KEY;
      expect(cartoDarkTileUrl()).not.toMatch(/key=/);
    } finally {
      if (original === undefined) delete process.env.EXPO_PUBLIC_CARTO_API_KEY;
      else process.env.EXPO_PUBLIC_CARTO_API_KEY = original;
    }
  });
});
