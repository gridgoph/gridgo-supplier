/**
 * The iPhone build's native settings that no package plugin gets right on its
 * own. Every mod here is an iOS mod, so the Android build is untouched.
 *
 * - **No background audio.** expo-audio's plugin adds `UIBackgroundModes:
 *   audio` by default, and App Review refuses a background mode the app does
 *   not use (guideline 2.5.4). GRIDGO plays its sounds in the foreground only.
 *   app.json also disables expo-audio background playback on both platforms;
 *   this final iOS pass keeps the mode out if another plugin adds it.
 *   The microphone purpose string stays: a shop still talks to the rider
 *   collecting a job on an in-app call.
 * - **Dynamic frameworks.** `@react-native-firebase` resolves the Firebase iOS
 *   SDK through Swift Package Manager, which needs `use_frameworks! :linkage
 *   => :dynamic` (https://rnfirebase.io/ios-spm). Set through
 *   `Podfile.properties.json`, the same key expo-build-properties writes.
 * - **Firebase, only with its file.** Push on iPhone goes through Firebase
 *   Cloud Messaging, which needs `GoogleService-Info.plist`. Firebase's own
 *   plugin also rewrites the Android build, so only its two iOS steps run:
 *   copy the file into the project and call `FirebaseApp.configure()`. A build
 *   without the file gets neither, because `configure()` with no file crashes
 *   the app at launch; `store/push.ts` then registers the APNs token instead.
 */
const path = require("node:path");
const { withInfoPlist, withPlugins, withPodfileProperties } = require("expo/config-plugins");

// The iOS steps are not in the package's `exports`, so resolve them by path.
const firebaseIos = () =>
  require(
    path.join(
      path.dirname(require.resolve("@react-native-firebase/app/package.json")),
      "plugin/build/ios",
    ),
  );

const withoutBackgroundAudio = (config) =>
  withInfoPlist(config, (config) => {
    const modes = config.modResults.UIBackgroundModes;
    if (Array.isArray(modes)) {
      const kept = modes.filter((mode) => mode !== "audio");
      if (kept.length) config.modResults.UIBackgroundModes = kept;
      else delete config.modResults.UIBackgroundModes;
    }
    return config;
  });

const withDynamicFrameworks = (config) =>
  withPodfileProperties(config, (config) => {
    config.modResults["ios.useFrameworks"] = "dynamic";
    return config;
  });

const withIosStoreBuild = (config) => {
  const plugins = [withoutBackgroundAudio, withDynamicFrameworks];
  if (config.ios?.googleServicesFile) {
    const { withIosGoogleServicesFile, withFirebaseAppDelegate } = firebaseIos();
    plugins.push(withIosGoogleServicesFile, withFirebaseAppDelegate);
  }
  return withPlugins(config, plugins);
};

module.exports = withIosStoreBuild;
