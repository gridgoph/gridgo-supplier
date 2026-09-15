import { nativeHeaderInsetOptions } from "@/lib/nativeHeaderInsets";

describe("native header safe-area ownership", () => {
  it("does not add a second status-bar inset inside an already-inset Android window", () => {
    expect(nativeHeaderInsetOptions("android", 0)).toEqual({
      unstable_nativeProps: {
        headerConfig: { disableTopInsetApplication: true },
      },
    });
  });

  it.each([24, 46, 59])("keeps the native keep-out area in an edge-to-edge Android window (%s)", (top) => {
    expect(nativeHeaderInsetOptions("android", top)).toEqual({
      unstable_nativeProps: {
        headerConfig: { disableTopInsetApplication: false },
      },
    });
  });

  it("follows new insets when window geometry changes", () => {
    expect(nativeHeaderInsetOptions("android", 46).unstable_nativeProps?.headerConfig.disableTopInsetApplication).toBe(false);
    expect(nativeHeaderInsetOptions("android", 0).unstable_nativeProps?.headerConfig.disableTopInsetApplication).toBe(true);
  });

  it.each(["ios", "web"])("leaves %s header geometry with its platform", (platform) => {
    expect(nativeHeaderInsetOptions(platform, 0)).toEqual({});
    expect(nativeHeaderInsetOptions(platform, 59)).toEqual({});
  });
});
