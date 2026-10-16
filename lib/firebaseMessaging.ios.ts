/**
 * Firebase Cloud Messaging on iPhone.
 *
 * gridgo-api sends every push through FCM HTTP v1. On Android that already
 * reaches the phone, because expo-notifications returns an FCM token. On iOS
 * expo-notifications returns the raw APNs token, which FCM cannot address, so
 * the iPhone build asks Firebase for an FCM token instead and the same sender,
 * token type and payload serve both platforms. Firebase maps that token to the
 * APNs token itself, using the APNs key uploaded to the Firebase project.
 *
 * Everything else about push stays with expo-notifications: the permission
 * dialog, the foreground handler and the tap that opens a job.
 *
 * Never imported statically by anything that loads at launch, and never
 * trusted to exist: Expo Go has no Firebase, and a build made without
 * `GoogleService-Info.plist` has the native module but no configured app
 * (`plugins/withIosStoreBuild.js` leaves `FirebaseApp.configure()` out of it).
 * Both answer null, and `store/push.ts` falls back to what it did before.
 */

import type { FirebaseMessaging } from "./firebaseMessaging";

export type { FirebaseMessaging } from "./firebaseMessaging";

type FirebaseAppNative = typeof import("@react-native-firebase/app");
type FirebaseMessagingNative = typeof import("@react-native-firebase/messaging");

let cached: FirebaseMessaging | null | undefined;

export function getFirebaseMessaging(): FirebaseMessaging | null {
  if (cached !== undefined) return cached;
  cached = null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Must stay lazy: Expo Go has no Firebase.
    const app = require("@react-native-firebase/app") as FirebaseAppNative;
    // No configured app means the build had no GoogleService-Info.plist.
    if (app.getApps().length === 0) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- Same as above.
    const native = require("@react-native-firebase/messaging") as FirebaseMessagingNative;
    const messaging = native.getMessaging();
    cached = {
      getToken: async () => {
        // Firebase registers with APNs by itself at launch; asking again is
        // harmless and covers a launch where that had not finished yet.
        if (!native.isDeviceRegisteredForRemoteMessages(messaging)) {
          await native.registerDeviceForRemoteMessages(messaging);
        }
        return native.getToken(messaging);
      },
      onTokenRefresh: (listener) => native.onTokenRefresh(messaging, listener),
    };
  } catch {
    cached = null;
  }
  return cached;
}
