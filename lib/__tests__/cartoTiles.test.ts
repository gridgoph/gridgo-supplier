import { cartoApiKey, cartoDarkTileUrl } from "@/lib/cartoTiles";

describe("cartoDarkTileUrl", () => {
  it("leaves dark tiles keyless when no key is configured", () => {
    expect(cartoApiKey({})).toBeNull();
    expect(cartoDarkTileUrl({})).not.toMatch(/key=/);
  });

  it("appends the Carto key as the documented query param", () => {
    expect(cartoDarkTileUrl({ EXPO_PUBLIC_CARTO_API_KEY: "test-key_1" })).toContain(
      "?key=test-key_1",
    );
  });
});
