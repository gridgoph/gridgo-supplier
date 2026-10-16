/**
 * Firebase Cloud Messaging on iPhone, or nothing.
 *
 * This is the file every platform except iOS gets: Android push comes from
 * expo-notifications (`store/push.ts`), and the web has no push. Metro picks
 * `firebaseMessaging.ios.ts` for the iPhone build, so neither the Android nor
 * the web bundle ever contains `@react-native-firebase`.
 */

export type FirebaseMessaging = {
  /** The FCM registration token for this installation. */
  getToken: () => Promise<string>;
  /** Firebase reissued the token; returns the unsubscribe. */
  onTokenRefresh: (listener: (token: string) => void) => () => void;
};

export function getFirebaseMessaging(): FirebaseMessaging | null {
  return null;
}
