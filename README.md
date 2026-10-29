# GRIDGO Supplier

The **supplier** mobile app for GRIDGO (Davao City managed-printing marketplace).

Scaffolded from `gridgo-client` with shared design tokens and logo assets, using Expo, Expo Router, and NativeWind. [package.json](package.json) owns the current dependency versions; [package-lock.json](package-lock.json) locks the installed graph.

## Role scope

- Time-sensitive job alerts, accept/decline
- Production status updates and packaging readiness (quality is checked together with the rider at pickup)
- Pickup handoff
- Payout notifications

The mobile app also includes schedule, capacity, accreditation, and the shop’s listing board. See [PRD.md](PRD.md) for product scope and job-evidence behavior.

## Local development

Use Node.js 22.13 or newer, the minimum for [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/).

Clerk provides identity; **gridgo-api** provides supplier data and authorization. Set `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` for your Clerk instance before starting Metro. The local supplier fixture is available only in development builds. Supabase and PayMongo are not app dependencies.

```bash
# terminal 1
cd ../gridgo-api && npm install && npm run dev

# terminal 2
npm install
EXPO_PUBLIC_API_URL=http://127.0.0.1:8787 npm start
```

On a physical device, use your machine's LAN IP instead of `127.0.0.1`.

## Scripts

| Command | Does |
|---|---|
| `npm start` | Metro for Expo Go |
| `npm run start:usb` | Set up Android USB port forwarding and start Metro for the development client |
| `npm run android` / `npm run ios` | Build and run a native development app |
| `npm run lint` | ESLint |
| `npm test` | Jest |

Typecheck: `npx tsc --noEmit`. Script definitions and the Metro port live in [package.json](package.json).

For native push, use an installed development build. Connect an authorized Android device over USB, build with `npm run android`, then use `npm run start:usb` for later Metro sessions. Supply `GOOGLE_SERVICES_JSON` when building with Firebase; see [Push notifications](AGENTS.md#push-notifications) for configuration and Expo Go limitations.

## Update prompt

A Google Play build never does any of this; see [Google Play bundle](#google-play-bundle).

A release build compares its `versionCode` with the newest GitHub Release at launch and on return to the foreground, and offers the APK when there is a newer one ([lib/appUpdate.ts](lib/appUpdate.ts)). Development builds and Expo Go have no real `versionCode` and skip the check. To see the prompt anyway, pretend to be an old build:

```bash
EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE=1 npm start -- --clear
```

The override works in development only. `--clear` matters: the value is inlined at bundle time, and Metro's cache would keep the old one. Restart Metro with a higher number (for example `2`) to see the one-time "Update completed" note on the next launch.

Every decision the check makes is logged to Metro in a development build, one `[update-check]` line each: which build it compared (or `off: Expo Go and EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE is not set` when the override never reached the bundle), what GitHub answered, whether the release was offered, and when the sheet is presented. If the prompt does not appear, those lines say why. A **Later** from an earlier run is remembered on the phone for the rest of that day; clear Expo Go's storage for the project to see the prompt again.

## Android emulator API URL

From the **Android emulator**, `127.0.0.1` is the emulator itself. Use:

```bash
EXPO_PUBLIC_API_URL=http://10.0.2.2:8787 npm start
```

For a physical device over Wi-Fi, use the host machine’s reachable LAN address. API URL precedence and build-time configuration are documented in [AGENTS.md](AGENTS.md#mvp-stack-current-phase).


### Release notifications

After the Android workflow uploads the APK and publishes the latest GitHub Release
on a push to `main`, `scripts/announce-release.mjs` broadcasts the released version.
Firstmate configures the repository secret `RELEASE_ANNOUNCE_TOKEN` with the same
value as the API environment variable. Deploy the API release-announcement route
and migration first. Missing configuration skips with a notice; delivery failures
warn in the job summary without failing the published release. Manual dispatches
never broadcast. `lib/releasePush.ts` recognizes the fixed public release copy and
opens this app's existing download URL on a push tap, including while signed out.
A Google Play build ignores that tap's download and leaves the push in the inbox.

### Google Play bundle

The side-load APK is unchanged: every push to `main` still builds it, puts it on the
download page, publishes the GitHub Release and broadcasts the release push. The Play
bundle is an extra build that you start by hand. You upload it to Play Console yourself,
or let the run upload it to a selected testing track (see below).

1. In GitHub, open **Actions → Android release APK or Play testing bundle → Run workflow**. Choose `main`,
   select **play_bundle**, and run it.
2. When the run is green, open its summary and download the `gridgo-supplier-<version>-<sha>-play`
   artifact. The zip holds `gridgo-supplier-<version>-<sha>.aab`. The summary also shows the versionCode.
3. In Play Console, open the app for `ph.gridgo.supplier` → **Testing → Internal testing →
   Create new release**, upload the `.aab`, and roll it out to your testers.

That run builds `./gradlew bundleRelease` with the same upload key and public
configuration as the APK. `scripts/verify-release-apk.sh` checks it the same way: the
signer must match the keystore alias, and the API URL, Clerk and CARTO keys must be
inlined in `base/assets/index.android.bundle`. Unless **submit_to_play** is selected,
the run publishes nothing: no APK, no landing-site upload, no GitHub Release, no release
push and no What's new record. The artifact is kept for 30 days.

The run sets `EXPO_PUBLIC_APP_DISTRIBUTION=play` when it builds. Google Play does not
allow an app installed from Play to offer an APK from somewhere else. With the flag set,
the update sheet, the "Update completed" note, the Alerts update and "Updated to" cards
and the release push's download link are all off (`lib/buildDistribution.ts`,
`offersSideloadUpdates` in `lib/appUpdate.ts`). Play delivers the updates. When the flag
is not set, the build is the side-load APK, and it behaves as before.

**versionCode.** Play accepts only a versionCode higher than every one it has seen for
the app. The versionCode is the workflow's run number (`GRIDGO_BUILD_NUMBER`, see
`app.config.ts`). APK runs and Play runs share one counter, and each new run gets a
higher number, so a new Play run always has a higher versionCode than the last bundle
you uploaded. Upload bundles oldest first. Do not upload a bundle from an older run after
a newer one. A **Re-run** keeps the original run's number, so start a new run instead.
GitHub restarts the count if the workflow file is renamed or replaced, so keep the file
where it is.

**Upload to a testing track automatically.** Select **submit_to_play** as well as
**play_bundle** when you run the workflow. **play_track** defaults to **internal**
(`eas.json`, profile `production`, track `internal`); explicitly choose **closed** to
use profile `closed`, track `alpha` (Google Play's closed testing track). Both use
release status `completed`: Google still reviews closed releases before testers can
access them, while a draft would need a manual Play Console step every time.

The run builds and verifies the bundle as above and keeps the artifact. Then
[EAS Submit](https://docs.expo.dev/submit/android/) uploads that same `.aab` to the
selected testing track, and release notes are set on that same track. The run summary
names the selected track. **play_track** is ignored unless **play_bundle** and
**submit_to_play** are both enabled; the APK path is unchanged.

- The build still runs in GitHub Actions with the upload key. EAS only uploads the file.
  No keystore goes to Expo.
- The run never uploads to production and never promotes a release. To move a build to
  another track, promote it by hand in Play Console.
- The step needs two repository secrets: `EXPO_TOKEN` (an Expo access token for the
  `felyciaaa` account) and `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` (the Play service account's
  JSON key, with release permission for testing tracks). The key is written to a mode-600
  file under `$RUNNER_TEMP`, outside the workspace, for that step only. It is never
  printed, and it is removed when the step ends.
- `eas-cli` is pinned in the workflow. The app is linked to its EAS project
  (`@felyciaaa/gridgo-supplier`) through `owner` and `extra.eas.projectId` in `app.json`.
- `eas submit` carries no release notes, so the same step then sets them on that release
  with the Google Play Developer API, using the same service account
  (`scripts/play-release-notes.mjs`). The notes are the version's What's new (the pending
  `whats-new/` notes, or the newest release in `WHATS_NEW.md`), newest first, in whole
  lines within Play's 500-character limit for en-US. The script reads the notes back from
  Play, and the run summary shows them.
- The versionCode is the run number, so every upload is newer than the last one and
  testers get it as an automatic update.
- If the submission fails, the run fails, but the artifact is still there to upload by hand.

## iPhone build and TestFlight

The iPhone app builds on a GitHub-hosted Mac (`macos-26`, Xcode 26.6; Expo SDK 57 needs
Xcode 26.4+), because the repository is public and those minutes are free and uncapped while
the Expo plan's iOS builds run out. **Actions → iOS TestFlight → Run workflow** runs
`eas build --local` with the `production` profile in `eas.json` (an App Store build; EAS
still holds the signing certificate and profile and raises the build number by one each
time) and then uploads the IPA to App Store Connect with `xcrun altool`. Untick
**submit_to_testflight** to build only. The run summary names the version and build number.
Nothing reaches the App Store listing or review from here.

What the iPhone build has that Android does not:

- **Sign in with Apple** on Sign in, above Google (`components/AppleSignInButton.ios.tsx`,
  `lib/appleSignIn.ts`). Like Google, it only proves who the person is: the session goes
  through the same supplier door, so a person with no shop goes on to apply. Android and
  the web draw nothing.
- **Push through Firebase.** The API sends through FCM, which cannot address the APNs token
  expo-notifications returns on iOS, so the iPhone registers Firebase's FCM token instead
  (`lib/firebaseMessaging.ios.ts`). `@react-native-firebase` is linked on iOS only
  (`react-native.config.js`); Android push is unchanged. A build without
  `GoogleService-Info.plist` leaves Firebase out and registers the APNs token as before.
- **App Store settings** in `app.json` and `plugins/withIosStoreBuild.js`: iPhone only (no
  iPad), a GRIDGO sentence for every permission, no background audio mode (the call
  microphone stays), the export-compliance answer, and dynamic frameworks for Firebase.

The workflow needs, once:

| Where | Name | What |
|---|---|---|
| GitHub secret | `EXPO_TOKEN` | Already used by the Play upload. |
| GitHub secret | `ASC_API_KEY_P8` | App Store Connect API key (Users and Access → Integrations → Team Keys, role App Manager): the `.p8` file's text. |
| GitHub secret | `ASC_KEY_ID` | That key's Key ID. |
| GitHub secret | `ASC_ISSUER_ID` | The Issuer ID shown above the key list. |
| GitHub variable | `ASC_APP_ID` | The app's Apple ID (App Store Connect → the app → App Information). Not secret. |
| GitHub secret | `GOOGLE_SERVICE_INFO_PLIST_BASE64` | The Firebase `GoogleService-Info.plist` for `ph.gridgo.supplier`, base64-encoded. Never commit it. |

`EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` and `EXPO_PUBLIC_CARTO_API_KEY`
come from the repository secrets the Android release already uses; the workflow copies them
to the EAS `production` environment as Sensitive variables before each build, and the local
build reads them back from there. The Firebase file is decoded into a private temp file on
the runner instead, because a local build cannot read an EAS Secret file variable.
`app.config.ts` refuses a store build that is missing any of them or the Firebase file
(`iosStoreBuildProblems`). The App Store Connect key lets EAS check the signing credentials
and lets altool upload.

To try the iPhone build locally, drop `GoogleService-Info.plist` in the repo root (it is
gitignored) or point `GOOGLE_SERVICE_INFO_PLIST` at it, then `npx expo prebuild -p ios` on
a Mac. Sign in with Apple and Firebase need a development build; Expo Go has neither.
