/**
 * Firebase's React Native modules serve the iPhone build only.
 *
 * Android push already works through expo-notifications, which brings its own
 * Firebase Messaging service. Linking `@react-native-firebase/messaging` there
 * would register a second messaging service beside it, so Android does not
 * link these modules at all and its build stays exactly as it was. See
 * `store/push.ts` and `plugins/withIosStoreBuild.js`.
 */
module.exports = {
  dependencies: {
    "@react-native-firebase/app": { platforms: { android: null } },
    "@react-native-firebase/messaging": { platforms: { android: null } },
  },
};
