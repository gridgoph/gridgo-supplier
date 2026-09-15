/**
 * A native Android toolbar must consume the status-bar inset only when the
 * navigator extends underneath it. Expo Go can host an already-inset window;
 * react-native-screens 4.26 otherwise adds the decor-view inset a second time.
 * Keep the native inset in edge-to-edge windows, including after rotation.
 * iOS and web retain their platform defaults.
 */
export function nativeHeaderInsetOptions(platform: string, topInset: number) {
  return platform === "android"
    ? {
        unstable_nativeProps: {
          headerConfig: { disableTopInsetApplication: topInset === 0 },
        },
      }
    : {};
}
