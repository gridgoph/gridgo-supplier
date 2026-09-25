# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

You are an expert React Native and Expo engineer helping me build GRIDGO.

Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.

Think like a senior mobile developer.

---

## Project Overview

This repo is **GRIDGO Supplier** — the supplier mobile app for a Davao City managed-printing marketplace. It covers time-sensitive job alerts, accept/decline, production updates, packaging readiness (a single signal; the six quality checks are done together with the rider at the counter), pickup handoff, and payout notifications.

GRIDGO ships one app per role. Client, Rider, Operations, and Super Admin surfaces live in separate codebases. Do not put client request flows, rider dispatch, or Operations QA into this binary.

The app includes:

- Supplier application and accreditation as defined in [PRD.md](PRD.md)
- Assignment inbox with accept / decline inside SLA, where accepting names the shop's own price
- Approved specification and artwork review (read-only of QA-approved files)
- Production progress, packaging readiness, and Proof of Fulfilment against each payout milestone
- Pickup handoff readiness
- Earnings: four milestones per job, each gated on evidence

**Cross-cutting**

- Clerk identity with a `gridgo-api` supplier projection. Role must be `supplier`.
- Light and Dark themes with identical labels, states, and workflows.
- Shared design tokens with the client starter (`constants/theme.ts`, `global.css`, logo assets).


## Tech Stack

- Expo
- React Native
- TypeScript
- Expo Router
- NativeWind
- Zustand
- AsyncStorage
- Zustand for client session state
- Clerk Expo with SecureStore token caching
- Local **domain API** via `gridgo-api`; a replaceable local auth fixture remains in development only

Do not introduce new major libraries unless there is a strong reason. Ask before installing anything new.

---


## MVP stack (current phase)

Clerk owns production identity and session issuance. `gridgo-api` remains the domain and authorization boundary; Supabase and PayMongo are not part of this app.

Every screen that needs network uses **`lib/api.ts`** against the shared local **`gridgo-api`**:

- **Operational model v2** — `gridgo-api`'s `docs/OPERATIONAL_MODEL_V2_API.md` is the authoritative contract for routes, states, role authorization and money. Read it before changing any flow; it supersedes anything older that disagrees. The supplier proof-to-client loop, cash on delivery, and Pilot Credits as a payment method are all **retired** — do not reintroduce them.
- **Clerk identity** — `ClerkProvider` uses `@clerk/expo/token-cache` (SecureStore). Membership and role projection are defined in [Supplier Clerk Design](docs/superpowers/specs/2026-08-14-supplier-clerk-design.md#access-model); `components/ClerkSessionBridge.tsx` implements that boundary (enroll does not write Clerk metadata). Never write role metadata client-side. The publishable key is baked in `app.config.ts` as `extra.clerkPublishableKey` (preferred) and `lib/clerk.ts` still reads `process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` statically so Babel can inline it if extra was empty at prebuild. Release runtime still requires `pk_live_`; `__DEV__` may use `pk_test_`. **Public apply** is Clerk sign-up (method-based `@clerk/expo`: `signUp.password`, emailed code if required, `finalize` — no `prepareFirstFactor`) then `POST /auth/clerk/enroll/supplier` with Bearer JWT + `Idempotency-Key` via `api.enrollSupplier` / `session.enrollSupplier`. Body is exactly `{ profile: { shopName, contactName, phone, location }, serviceCategories }`. Do not call `/auth/signup`. Invitation accept (`__clerk_ticket`) stays a secondary path. Google may authenticate or create an identity, but never grants supplier access. A **development** build retains the replaceable local supplier fixture behind `__DEV__` in `lib/devLogin.ts`; Metro strips its credential and connection-line literals, proved by `app/__tests__/devLoginDisclosure.test.ts` and `scripts/assert-no-dev-credentials.mjs`.

- **Session → routes** — `Stack.Protected` in `app/_layout.tsx` (SDK 57) guards Clerk restoring, signed out, access mismatch, signed in, and matchable states. Tabs mount for **any** signed-in supplier. A shop with `verificationStatus !== "approved"` still lands on `/(tabs)/home` (`lib/launch.ts`); Home tells the truth about the wait. Accreditation is a screen they open from Home / Settings / Account, not the post-auth trap. Job / payout / service catalogue stay behind `isMatchable`; the listing board remains available to pending shops. Unassigned Clerk (no GRIDGO membership) goes to apply, never `/access`. Do not sprinkle logout/401 redirects through domain screens; session state owns the guards. Expired Clerk sessions retry once through `lib/api.ts`, then `store/session.ts` opens Sign in; `store/__tests__/sessionExpiry.test.ts` pins the distinction from mismatch and withdrawn access.
- **Files** — `gridgo-api`'s `docs/STORAGE_API.md` is the authoritative contract; read it before touching `lib/files.ts`. Upload streams from the device URI (`expo-file-system/legacy` `createUploadTask`) and a file is stored only when a `201` returns `file.fileId`. Attaching a `fulfilment_proof` names a `milestoneCode` and moves **money, not state** — the order does not transition.
- **API base** — `getApiBase()` / `resolveApiBase()` in `lib/api.ts`: `EXPO_PUBLIC_API_URL` override, else hostname from Expo `hostUri` (so a USB development build on the LAN uses the packager IP), Android loopback remapped to `10.0.2.2`, port from `EXPO_PUBLIC_API_PORT` (default `8787`). Do not hardcode a developer LAN IP or a deployment's domain — **pointing a build at a hosted API is configuration, not code**: set `EXPO_PUBLIC_API_URL` in the build's environment (EAS: an `env` entry on the profile in `eas.json`; a local export: on the `npx expo export` command) and it wins over everything, on both platforms, with or without a dev server in reach. Expo inlines `process.env.EXPO_PUBLIC_*` at bundle time, so the value is baked into the binary and there is nothing to fall back *to* — verify a build by grepping the exported bundle for the host. `lib/__tests__/apiBase.test.ts` pins the precedence.
- **Local Android** — use the USB development-client workflow in [README.md](README.md#scripts). Do not replace a running USB packager with a LAN Expo Go packager. Firebase configuration and push limitations are under **Push notifications** below.
- **Zustand** — session and feature stores (not React Context for global session).
- **Money** — PHP minor units only, formatted at the edge. The client pays a 75% digital downpayment then a 25% digital balance; neither is this app's business. What **is**: the shop's own `supplierPriceMinor` and its milestone `amountMinor`. GRIDGO's commission is withheld from this app by the server's role projection, so if a field here ever looks like commission, the wrong field was read. Milestone shares split the shop's price, never the client's total.
- **`expo start --web`** — the web bundle throws `Cannot use 'import.meta' outside a module` before it hydrates: zustand v5's devtools middleware ships `import.meta.env`, and Metro emits it into a classic `<script>`. Only web is affected; iOS/Android are fine. To render the app in a browser (screenshots, visual review) put a proxy in front of the dev server that rewrites that token. Signed-in routes also bounce to `/login` on a hard reload because the guard runs before the session rehydrates, so navigate in-app rather than reloading a deep link. The in-app theme override is a **no-op on web** (`Appearance.setColorScheme` does not exist there — see `hooks/useTheme.ts`), so capture Light and Dark by launching the browser under each `prefers-color-scheme`, not by tapping Settings.

Product scope for this binary: **`PRD.md`**. Fleet blueprint: `gridgo-tinker`.

## Where the rules live

Prefer these modules over burying logic in screens:

- `lib/jobState.ts` — the only place a raw order state becomes a label, an action, or a journey step. `actionsForJob` takes the **order**, not the state, because what a shop should do next depends on which evidence it still owes: an outstanding Proof of Fulfilment takes the yellow and demotes the forward step, since the shop's first share of the job's money waits on a photo. `targetState: null` means the step is not a transition. `waitingOn` says whose move it is when the shop has none. `presentTimelineNote` translates the check codes the platform composes into its own notes — a failed pickup arrives as `visible_defects` and would otherwise land on a shop's timeline verbatim.
- `lib/milestones.ts` — the only place that reads `payoutMilestones`, and the source of the payout vocabulary. `earningsSplit`'s `needsProofMinor` means one thing only: money the shop could release **today** by photographing something. A part the job has not reached, and the rider's delivered share, are `laterMinor` — folding them together told a shop that a print run it had not started was evidence it owed, which is how a real prompt learns to be ignored. Two platform rules shape every screen built on it: shares split the **shop's** price, and **nobody in this app releases money** — a shop files evidence, Operations releases, so "done" here means *evidence filed* and no copy may imply the money has moved. Each order carries `payoutPlanVersion` (gridgo-api `docs/OPERATIONAL_MODEL_V2_API.md#supplier-payout-milestones`): plan 2, from 25 Sep 2026, is `production_started` 40% on the shop's photo, `delivered` 35% on the rider's evidence, `issue_window` 25% with no file once the complaint window closes; plan 1 (older orders) is printing / packaging / delivered / retention and must keep working. Stages render **in the API's array order under the API's `label`**, and who owes the proof comes from `releaseRequires` — never a hard-coded list of codes, and an unknown code gets neutral words (`milestoneDefinition`), never another stage's. `payoutPlanOf` is the only plan check for copy that has no stages to read. A milestone the job has not reached yet reads "Not started", never "Proof needed" — a chip asking for work nobody can do teaches a shop to ignore the chips that matter.
- `app/(auth)/signup/` — public apply stepper (shop → location → services → review). Papers are not in apply; `app/accreditation.tsx` collects them after the account exists. `lib/onboardingSteps.ts`, `lib/signup.ts`, and `store/signupDraft.ts` own the draft. After send, `verificationStatus: pending` is correct and the shop goes to `/(tabs)/home`. Email / MFA / recovery codes use `components/JobTicketCode.tsx`. Invitation accept remains at `app/(auth)/accept-invitation.tsx`.
- `lib/homeBoard.ts` — the **only** place jobs are ranked by urgency, and the only place the floor's headline figure is chosen. Two rules it exists to hold: the figure is the shop's own money that has *stopped moving* (not earnings-to-date, which never goes down and which a shop cannot act on), and evidence owed outranks everything else on the list because it is the one stuck thing nobody else can unstick. An app with two rankings teaches a shop that list order means nothing — do not add a second.
- `lib/shopLocation.ts` + `components/ShopLocationPicker.tsx` + `lib/mapHtml.ts` + `components/MapFrame*.tsx` — the shop's own pin, and nothing else a map could show. Leaflet over OpenStreetMap tiles inside `react-native-webview` (pinned to the version in `node_modules/expo/bundledNativeModules.json`, which is what the rider app ships), with an iframe fallback for Expo web. **No Google** — settled fleet-wide and reverted once. Dark CARTO tiles take `EXPO_PUBLIC_CARTO_API_KEY` through the literal `process.env.EXPO_PUBLIC_CARTO_API_KEY` in `lib/cartoTiles.ts`; Expo inlines only that member expression, so a lookup on a variable named `env` ships the keyless URL and CARTO watermarks "API KEY REQUIRED". The picker is a full-height screen on purpose: a map inside a `ScrollView` fights the scroll for the same vertical pan.
- `lib/geocode.ts` — Nominatim, OpenStreetMap's own geocoder. It is a donated service with a real policy this module exists to keep, because a screen calling `fetch` cannot: one request a second through a single shared gate, an identifying `User-Agent`, cached answers, and **no search-as-you-type** — autocomplete is forbidden outright, so there is deliberately no per-keystroke entry point and search fires on submit. Failure is a sentence telling the shop to tap the map instead, never a dead screen.
- `lib/alertsApi.ts` / `store/alerts.ts` — the adapter header owns the provisional write contract and device-local fallback cleanup. Mark-all sends only the ids actually on screen. The store owns account-scoped persistence and unread reconciliation; callers use its `refresh()` boundary.
- `lib/alertStream.ts` + `lib/eventStream.ts` + `hooks/useAlertStream.ts` + `hooks/useLiveRefresh.ts` — shared SSE transport and focused resource refresh. Their doc comments own reconnect, replay, fallback, and subscription behavior. Events are refresh hints, never authorization or domain state. `lib/live.ts` scopes ownership to account identity, not approval status; `hooks/useReadVersion.ts` guards response order. Toasts stay at the top, away from primary actions, and `shouldToast` excludes what the shop is already viewing.
- `lib/push.ts` + `store/push.ts` + `hooks/usePushNotifications.ts` + `components/PushEnableCard.tsx` — the **third** delivery leg beside `GET /notifications` and the SSE stream: the server sends the same notification record through FCM HTTP v1 so it arrives with the app closed. See **Push notifications** below; the contract is `docs/OPERATIONAL_MODEL_V2_API.md` → *Push notifications* in `gridgo-api`.
- `lib/verification.ts` — the same `not_open_yet` pattern for the two account routes the platform is adding: a supplier moving its own shop pin, and attaching accreditation papers to its own pending account. The assumed shapes are in `lib/api.ts` under "Provisional routes".
- `lib/taxonomy.ts` — the only place that reads the shape of `GET /taxonomy`. `gridgo-api`'s `docs/TAXONOMY_API.md` is the contract; read it before touching this. Categories, subcategories, materials and finishes are four **flat** collections and every reference is a category `code` on the referring record. Two consequences the screens are built on: a supplier service line holds one `categoryCode`, so **a shop declares a category, not a subcategory**; and a line stored before the catalogue was published still holds a retired code, so every lookup goes through `resolveCategoryCode` or accredited work vanishes from the screen. `data/serviceCatalog.ts` is the chart this app falls back to when the platform has not migrated — it is display only, and `declarable` says whether a category can be filed against at all.
- `lib/supplierServices.ts` — the draft → submitted → verified → suspended → removed vocabulary, used by both the catalogue and capacity so there is one set of words. Widening `materialCodes` on a verified line sends it back to Operations; `expandsCapability` is how a screen warns before that happens.
- `lib/listings.ts` + `lib/listingsApi.ts` + `app/shop/` — the **shop's board**: what a client browses. Not the accreditation chart (`lib/supplierServices.ts`) and not the platform product catalogue — a listing sits under one **accredited category** line and one subcategory, and inherits that line's turnaround and accepted file types unless it overrides them. `lib/listings.ts` is the only place a listing's raw shape is read, and it reads every field defensively for a reason: the routes (`/me/catalog-items`, its option groups and options, `PUT …/file-formats`, `POST …/photos/reorder`, `/listing-starters`) are settled design in `gridgo-api` §4 and §8.2 that is still being built, so a **404 is a third outcome** (`not_open_yet`, the same pattern as `lib/verification.ts`) rather than a red failure — and never a local catalogue, because a board that exists on one phone is worse than an empty one. It also owns the vocabulary the screens must speak (board and listings, steps and add-ons, on the board and hidden, per piece and per pack of N, sample photos) and the rule that a refusal **names the missing thing** — `boardBlockers` is ordered, and the disabled action shows only the first, because a wall of eight reasons is not a next step. The wall's standing comes from GRIDGO's `blockers` (`boardStanding` in `lib/listings.ts`); the phone checklist (`boardBlockers` / `editorGuidance`) is editor guidance only. Tarpaulin & outdoor banners (`tarpaulins_outdoor_banners`) require `printerMaxWidthFeet` (integer feet, 1–20) before Put on the board; other families omit or null it — never a leftover number, and never millimetres. Distinct from `minimumWidthMilli`. A photo comes **off** a listing through the reorder route: send the ids that stay, GRIDGO drops the rest and unreferences those files, and the screen reloads from GRIDGO rather than trusting the write. `components/CropMarkFrame.tsx` is the one visual risk and it is content, not chrome — register marks say "this is a print sample", which a rounded product tile does not. The board is reachable for **pending** shops as well as approved ones: approval requires a finished listing, so trapping a waiting shop out of it would hold it behind the thing it is waiting for.
- `lib/catalogueBoard.ts` + `components/BoardRail.tsx` + `components/BoardHuntField.tsx` — **the board is filtered by GRIDGO, not by the phone.** `BoardQuery` is the whole question (hunt, kind of work, on-the-board, sort) and `toListQuery` is the only thing that turns it into `GET /me/catalog-items` parameters; `docs/SUPPLIER_CATALOG_API.md` in `gridgo-api` is the contract. The old `filterCatalogue` / `sortCatalogue` / `paginate` are gone on purpose — a shop with two hundred samples must not download two hundred samples to look at eight — and nothing may re-sort a page after it arrives, because GRIDGO ranks a hunt and a phone-side sort would put the worst match first. Three rules the screens are built on: the hunt waits **250ms** and the keyboard's search key skips the wait (a keystroke is a PostgreSQL query, so `BoardHuntField` owns both, plus the 80-character cap GRIDGO would otherwise refuse); an empty wall is **three different facts** — no board, a hunt that found nothing, a cut that found nothing — and only the middle one may offer "Clear the hunt", so the rail is drawn for a shop that *owns* listings rather than for a page that happens to have some; and pages come off an opaque `nextCursor`, so the screen keeps the cursors it has been given and `pageWindow` builds "9–16 of 40" from GRIDGO's `total`. The kind-of-work picker needs `loadBoardKinds`, one capped unfiltered read per screen, because a page of eight cannot name every kind on a board of sixty. The signature is the rail folding kind/standing/sort into one `Filters · N` chip while the shop is hunting — the count is the only thing that explains a hunt finding nothing while Hidden is still selected. The `+` stays the one yellow control, so the way out of an empty hunt is a charcoal `SecondaryButton`. Highlighting is weight in the **name only** (`lib/highlight.ts`, `components/HuntedName.tsx`): GRIDGO matches descriptions, add-on labels and prep steps too, and a colour wash would read as a standing the listing does not have.
- `lib/appUpdate.ts` + `store/appUpdate.ts` + `hooks/useAppUpdateCheck.ts` + `app/app-update.tsx` — the sideloaded APK's update prompt. The installed `versionCode` (CI run number, `app.config.ts`) is compared with the numeric suffix of the latest GitHub Release tag; every failure is silent to the shop, but a development build logs every decision as an `[update-check]` line in Metro (`logUpdateCheck`). The read sends its own `User-Agent`: GitHub answers a request without one with 403, the same status as its rate limit. Only an answered read starts the 4-hour foreground interval. A re-keyed root stack taking the sheet down is not a "Later" (`closeUpdateSheet(…, byShop: false)`), or a restored session would hide the offer for the day. The lib is pure so client and rider can take it as-is. The sheet route is **public** (a shop that never signs in still has to hear about a new build) and waits for the intro and a settled session, because the root stack is re-keyed on sign-in. Dev and Expo Go skip the check unless `EXPO_PUBLIC_UPDATE_CHECK_FORCE_VERSION_CODE` is set.
- `lib/problemReport.ts` + `app/report.tsx` — "Report a problem" (Account and a job's screen). Support chat is text-only, so a report is a new chat thread (`newThread: true`) whose first line is "Problem report", with job reference, app version and phone written underneath. No photo until `gridgo-api` has a chat file purpose and the Ops desk can open one.
- `lib/apiErrors.ts` / `lib/files.ts` — the only places that read an API error code. No `snake_case`, status code, or state string may reach a screen.
- `lib/schedule.ts` + `lib/capacity.ts` + `lib/blackouts.ts` + `lib/day.ts` — agenda grouping, capacity arithmetic, and closures. Day comparisons go through `toDayKey` (local calendar), never UTC slicing.
- `store/jobDrafts.ts` / `store/shopPlan.ts` — persisted through `lib/persistStorage.ts`, which uses AsyncStorage in every real runtime and inert storage only when `typeof window === "undefined"` during web SSR. Never gate persistence on `Platform.OS`.
- `lib/navigationOptions.ts` — header chrome for the root stack and the nested `app/job/[id]` stack; both must look identical. Every pushed screen carries a `title`, or iOS labels its back control with the route group and a shop hears "(tabs)". The back control is **always `headerBackButtonDisplayMode: "minimal"`** — the captain's decision, after a crew tried labelling it "Back". That option does two jobs at once: it gives the bare chevron *and* it is what stops iOS falling back to the previous route's title, so removing it to drop a label would bring "(tabs)" back. `app/__tests__/navigationChrome.test.ts` fails on a missing title or a `headerBackTitle`.
- `components/FormScrollView.tsx` — the only scroll surface a keyboard may open over, and where the caret gap, the outside-tap dismiss and the drag-to-dismiss are set once. React Native's own `KeyboardAvoidingView` is **retired here** and must not come back: it shifts a container without knowing which field is focused, so on a form of five the focused one still ends up under the keys, and it does nothing at all on Android. `react-native-keyboard-controller` (in Expo Go's bundled modules, so no development build) replaces it, and `KeyboardProvider` in `app/_layout.tsx` is what makes the two platforms agree — with it, Android stops resizing the window, so every `Platform.OS` split around the keyboard is gone and both platforms take the same path. Two shells carry the rest: `FlowScreen` and `OnboardingStep` (whose `fill` map step shortens instead of scrolling, because a map is not a list). `app/__tests__/keyboardSurfaces.test.ts` enumerates every file that draws a typeable field and fails when one is left to the platform's defaults — fix the rule there, never one screen at a time. **`className` on a component from another package resolves to nothing**: NativeWind v5 works by rewriting imports from `react-native`, so page spacing goes on a `View` inside the third-party scroll view, not on the scroll view.
- `hooks/usePullToRefresh.ts` — the only thing that may drive a `RefreshControl`'s `refreshing`. Every list here reloads on focus, and binding that flag to the screen's own `loading` put the platform refresh indicator on screen at every tab switch — on iOS it insets the scroll view to make room and takes it back again, so the page slid down and settled on every visit. A focus reload refreshes silently.
- Safe-area insets **stack** with design spacing, never `Math.max` with it: the inset is the OS keep-out zone and the padding is breathing room (`components/ScreenHeader.tsx` at the top, `components/GridgoTabBar.tsx` at the bottom). Taking the larger spends the whole gap on the notch.
- Bottom-bar geometry is **per platform** for the content row and **one rule** for what sits under it. Apple's tab bar is a 49pt row; Material Design 3's navigation bar container is 80dp. Under either, the space below is the system inset where the platform reserves one, and the 8dp design gap **only where it reserves none** — never both, which is the double-count that made iOS 122pt against UIKit's 83 and Android 136dp against MD3's 128. `tabBarMetrics` / `tabBarPaddingBottom` in `components/GridgoTabBar.tsx` are pure and carry the resulting heights; client, rider and supplier must carry the same numbers.
- Android reserves a bottom inset on **both** navigation modes, because `edgeToEdgeEnabled` is on (and Android 15 enforces it): measured on an API-35 device, three-button is **48dp** and gesture navigation **24dp** — the larger inset is the three-button bar, not the gesture one. A zero bottom inset on Android means the nav bar is hidden, or Expo web. Reasoning from "three-button reports nothing" is how a design gap gets added on top of an inset that was already there.
- Gestures: a swipeable must stay **mounted** across the state its own callback changes. Wrapping only the unread alerts in `ReanimatedSwipeable` tore the gesture handler out of the tree from inside its open callback and hung the app on a real device; the section policy lives beside the inbox state in `app/alerts.tsx`. `components/__tests__/AlertCard.test.tsx` and `app/__tests__/alertSections.test.tsx` cover gesture mounting and silent-refresh section stability. `GestureHandlerRootView` lives at the root of `app/_layout.tsx` — nothing gesture-driven responds on Android without it.

## Push notifications

The **third** delivery leg, beside `GET /notifications` and the SSE stream: the server sends the same notification record through **FCM HTTP v1** so it arrives with the app closed. `docs/OPERATIONAL_MODEL_V2_API.md` → *Push notifications* in **gridgo-api** is the contract — read it before touching `/devices` or the logout body. This is `gridgo-client`'s shape, ported: `lib/push.ts`, `store/push.ts` and `hooks/usePushNotifications.ts` came across near-verbatim, and only `pushTargetRoute`, the copy in `pushOfferCopy`, the signed-out rules, and where `PushEnableCard` is drawn are this app's. **Fix a fleet-wide push problem in all three apps, not one.**

- **`google-services.json` is never committed.** It is the captain's, covers all three packages from project `gridgo-c2ce9`, and reaches a build as configuration: `GOOGLE_SERVICES_JSON` names a path, or a copy dropped in the repo root is found. Absent, `app.config.ts` omits the key and the app runs with push simply unavailable — which is what keeps `expo start`, `tsc`, jest and `expo config --type public` working on a machine that has never seen the file. A path that is *named* and missing throws, because the alternative is a green build that installs and never receives anything. The release workflow stages it from `GOOGLE_SERVICES_JSON_BASE64` and asserts it carries an entry for `ph.gridgo.supplier` before prebuild; `__tests__/releaseWorkflow.test.ts` and `__tests__/appConfigFirebase.test.ts` pin both halves. **Never hand-edit Gradle for this** — the Expo plugin writes the `com.google.gms.google-services` wiring and copies the file into `android/app/` during prebuild.
- **The channel `gridgo_default` must exist before a token is requested.** Android 8+ downgrades or drops a message naming a channel the app has not created, and the Android 13 permission dialog does not appear until *some* channel exists. `store/push.ts` creates it ahead of every permission read for that reason, and the ordering is asserted. `gridgo_production_nudge` is created in the same step and is the only channel that plays `notification_alert.mp3`. It is for `shop_production_inactive` only. Do not put that sound on `gridgo_default`.
- **The permission is asked once and a refusal is effectively permanent.** Nothing may call `requestPermissionsAsync` cold on launch; the only callers are a tap on `components/PushEnableCard.tsx` or on the explainer sheet `app/push-prompt.tsx`. The explainer opens by itself over Home for a signed-in shop whose phone has not granted, at most once every 7 days (`lib/pushPrompt.ts`, persisted in `store/pushPrompt.ts`, presented by `hooks/usePushPromptCheck.ts`, one sheet at a time with the update sheet). The card is drawn on Home, the Alerts screen, a job **waiting on somebody else**, and accreditation. Once blocked (`canAskAgain === false`), `openNotificationSettings()` in `store/push.ts` is the only honest offer, and returning to the foreground re-reads the permission and registers.
- **Never statically import `expo-notifications`.** Expo Go Android SDK 53 throws at module load (`ExpoPushTokenManager`). `store/push.ts` and `hooks/usePushNotifications.ts` `require` it inside a try/catch when a call actually runs.
- **Registration does not wait for a session.** A shop that installs GRIDGO and never signs in still has to hear "there is a new version, update your app", so a granted phone registers **unclaimed** at launch (`api.registerDeviceUnclaimed`, provisional — see below) and signing in claims the same token through the ordinary `POST /devices`. Sign-out unregisters with the logout body and then re-registers unclaimed (`usePush.release`): signing out is not uninstalling. The sign-in screen does not ask for the permission — that spend happens after sign-in, from the explainer or the card.
- **`api.registerDeviceUnclaimed` is provisional and deliberately bypasses `request()`.** `POST /devices` requires a bearer today; the platform is opening it to an unauthenticated caller. A deployment without it answers `401`, and routing that through `request()`'s unauthorized handler would **sign a shop out because a provisional route is not live**. So it does its own `fetch`, and `store/push.ts` treats `401`/`403`/`404`/`405` as `not_open_yet` — no error, nothing shown, and the phone registers for real at the next sign-in.
- **Register only when granted, and re-register on every launch and every rotation.** `POST /devices` is idempotent by contract and moves a token that belonged to another account. A token Firebase quietly reissued is the usual reason push stops arriving with nothing visibly wrong, so `addPushTokenListener` is not optional.
- **The device token goes with `POST /auth/logout`, not to `/devices/unregister`.** After sign-out the bearer token is dead, so a phone that signed out first could no longer authenticate an unregister and would keep waking for the previous shop's job offers.
- **Foreground push and taps** — `hooks/usePushNotifications.ts` owns resource reconciliation, badge refresh, and deferred tap ownership checks; `lib/push.ts` owns foreground presentation and destination selection. Keep these decisions at those boundaries.
- **Supplier notifications are `shop_job_*` rows plus `shop_production_inactive`.** Assignment, production, pickup, and payout already arrive as shop inbox rows. A job waiting on the shop's next production move also gets `shop_production_inactive` when Operations' live cadence says so. The phone does not time that silence — the API lifecycle tick does. Do not add a local timer, and do not play `notification_alert.mp3` for any other type.
- **Expo Go cannot do any of this, and an unguarded call takes the app down with it.** Expo removed Android remote push from Expo Go in SDK 53 and the module *throws* rather than warns. A static `import` of `expo-notifications` is enough — it evaluates `ExpoPushTokenManager` at load. So the module is `require`d inside a try/catch when a call actually runs (`store/push.ts`, `hooks/usePushNotifications.ts`), and those calls stay wrapped. Unwrapped it is not a degraded feature, it is a white screen: seen on the emulator as `Cannot find native module 'ExpoPushTokenManager'` followed by `Cannot read property 'ErrorBoundary' of undefined` and a force-finished activity. Push is only observable in an installed build — `npx expo prebuild --platform android` + `./gradlew assembleRelease`, then `adb install`.
- **Prebuild can rewrite project configuration; commit before running it.** Preserve pending dependency edits; never reset `package.json` to discard generated script changes. Autolinking reads declared dependencies, not just packages present on disk. Inspect `npx expo-modules-autolinking search -p android` when checking native notification wiring.
- The payload's `data` map is an allowlist of exactly `notificationId`, `type`, `orderId`, `at`, all strings, with valueless keys omitted — **no money reaches a lock screen**, so the shop's price, its milestone amounts and GRIDGO's commission stay off it even if a future record carries them. It carries no order state, so a tapped screen still fetches.
- **A release build cannot reach a plain-HTTP API, so a local API needs one extra step to test against.** Expo puts `usesCleartextTraffic="true"` in the *debug* manifest only; a release APK pointed at `http://10.0.2.2:<port>` reports the API unreachable and every screen fails with it. This never affects a shipped build — `EXPO_PUBLIC_API_URL` is the deployed HTTPS origin — so do **not** "fix" it in `app.json`. To prove something against a local API from a release build, add `android:usesCleartextTraffic="true"` to the `<application>` tag in the *generated* `android/app/src/main/AndroidManifest.xml` and rebuild; `android/` is gitignored, so nothing follows you into a commit.

## Controls

Every input uses the control its data calls for, and the platform's own where the platform's *behaviour* is the point — a calendar, a keyboard, a sheet's physics. Not where it only brings geometry: a native control paints itself from the OS and cannot be told to use these radii, so it reads as borrowed, and differently borrowed on each platform. (Native modules bundled in Expo Go for SDK 57 are listed in `node_modules/expo/bundledNativeModules.json` — check it before adding another.)

- Dates → `components/controls/DateTimeField.tsx` (`@react-native-community/datetimepicker`; Android opens the dialog imperatively, iOS confirms in a sheet). Never a text box a date is typed into.
- Fixed small sets → `components/controls/SegmentedControl.tsx`; longer fixed sets → `OptionList`. The segmented control is built from tokens on purpose — `@react-native-segmented-control` was removed because iOS kept `UISegmentedControl`'s own rounding and Android's recreation hard-codes 9pt, on a screen of 12pt fields. Client and rider hold the same shape. Do not reinstall it.
- Bounded counts → `Stepper`. Money → `MoneyField` + `lib/money.ts`. Free text stays free text (`NoteField`).
- Anything irreversible → `await askConfirm({...})` from `store/sheets.ts`, with a question naming the thing. Never a bare "Are you sure?".

## Sheets and modals

A sheet is a **route**, never an overlay a screen draws. `lib/navigationOptions.ts` `sheetScreenOptions` presents one as `formSheet` sized to its content, so the platform provides the spring physics that track the finger, drag-to-dismiss, the back gesture, the scrim and its own reduced-motion handling. Nothing here re-implements any of that, and no new `<Modal>` should appear in this app.

`store/sheets.ts` is how a screen asks for one and waits: `const ok = await askConfirm({...})`, `const when = await askDate({...})`. Dismissing any way the platform allows resolves as declined — nothing is committed until the sheet's own action is pressed. The routes are `app/confirm.tsx` and `app/pick-date.tsx`; both render `components/SheetSurface.tsx`, which must never claim `flex-1` or the content-sized detent cannot measure it.

What gets which presentation:

- **Sheet** — a short question or a small step over something already on screen (a confirmation, the calendar, a production update).
- **Pushed screen** — a commitment with fields to read and fill (accept, decline, proof of fulfilment, handoff), every destination, and the shop-closure form. That form used to be `presentation: "modal"` and drew its own "Cancel", because a modal is dismissed rather than navigated back from; the captain wants the chevron every other screen has, so it stopped being a modal instead of wearing a control it should not have. Nothing depended on the presentation — both entry points push it, there is no dismiss guard, and its date picker is its own sheet route either way. `app/__tests__/navigationChrome.test.ts` pins that.

Android keeps its own imperative system dialogs for date and time (`DateTimeField`); the sheet route is what every other platform gets.

## Development Philosophy

Build feature by feature.

For every feature:

1. Read this file first.
2. Keep the implementation simple.
3. Avoid overengineering.
4. Prefer readable code over clever code.
5. Build the smallest useful version first.
6. Refactor only when repetition appears.

---

## Decision Making

If something is unclear or could be improved, suggest a better approach. If a new library would significantly help, recommend it, explain why, and ask before adding it.

Do not install new libraries without approval.

---

## Architecture

Use this folder structure:

```
app/
  (auth)/
  (tabs)/
components/
constants/
data/
hooks/
lib/
store/
types/
assets/
```

**app/** is for routes and screens only. Screens compose components and call hooks or stores. They should not contain large reusable UI blocks or business logic.

**components/** is for reusable UI. Create a component when it is reused in multiple places, when it makes a screen easier to read, or when it represents a clear UI concept. Examples for this app: `PrimaryButton`, `SecondaryButton`, `StatusChip`, `JobCard`, `SpecRow`, `SelfQcCard`, `CountdownTimer`, `EmptyState`. Do not create components too early.

**Brand lockup** — `components/GridgoLogo.tsx` owns the mark, wordmark, and typed role lockups (`client` | `business` | `supplier` | `rider` | `admin`). Entry points in this app use `role="supplier"`. Do not invent per-screen role strings. `size` is the lockup's height and the mark's edge: with a role the mark spans **both** text lines, so every proportion is derived in `gridgoLockupMetrics` — change the ratios there, never the layout in a screen. The mark's height must equal the text block's; a mark only as tall as the wordmark line is the regression this has shipped twice.

**data/** holds hardcoded content. Keep it typed.

**store/** holds Zustand stores. Examples of state to keep here: session, theme preference (`system` | `light` | `dark`), the in-progress print request draft (product, size, material, quantity, deadline, address, uploaded artwork), cart/reorder items, order list and selected order, active delivery tracking as received (rider location, ETA, last-updated timestamp, stale flag), and the unread notification count. Persist with AsyncStorage when needed — theme preference, session, and the request draft are worth persisting. Never persist rider location or ETAs; they are someone else's live data and go stale the moment the app is backgrounded.

**lib/** holds external service helpers (clerk.ts, api.ts, cn.ts). Never expose secret keys here.

---

## UI Rules

For any UI task:

- Replicate the provided design exactly.
- Match layout, spacing, padding, font sizes, font hierarchy, colors, border radius, shadows, alignment, and proportions.
- Do not approximate. Do not simplify unless explicitly asked.

---

## Design Tokens

This section is the source of truth for GRIDGO's visual system. When a mockup is provided for a screen, replicate it exactly — the tokens below are what it is built from.

Define tokens once in `constants/theme.ts` and consume them by semantic name. Never hard-code a hex value in a screen or component.

### Color

| Token | Light | Dark | Use |
|---|---:|---:|---|
| `canvas` | `#F8F8F8` | `#000000` | Screen background |
| `surface` | `#FFFFFF` | `#141414` | Cards, sheets, navigation |
| `surfaceVariant` | `#F0F0F0` | `#1E1E1E` | Inactive panels, grouping |
| `surfaceHigh` | `#FFFFFF` | `#2A2A2A` | Selected/elevated panel |
| `textPrimary` | `#1A1A1A` | `#F0F0F0` | Headings and core data |
| `textSecondary` | `#4A4A4A` | `#CCCCCC` | Supporting text |
| `textMuted` | `#7A7A7A` | `#808080` | Metadata, inactive labels |
| `outline` | `#DCDCDC` | `#2E2E2E` | Cards, fields, dividers |
| `outlineSubtle` | `#EEEEEE` | `#1E1E1E` | Quiet divider |
| `accent` | `#1A1A1A` | `#F0F0F0` | Monochrome structural control |
| `accentOn` | `#FFFFFF` | `#000000` | Text/icon on accent |
| `brand` | `#D4A017` | `#FFDE58` | Small links and badges, "View all" |
| `actionYellow` | `#FFDE58` | `#FFDE58` | Primary CTA, current step, active nav, map route |
| `success` | `#2E7D32` | `#66BB6A` | Approved, completed |
| `error` | `#C62828` | `#EF5350` | Blocked, failed |
| `warning` | `#F57F17` | `#FFCA28` | Risk, attention |
| `info` | `#1565C0` | `#42A5F5` | Informational, support |

### The yellow rule

`actionYellow` is a finite attention budget, not a brand fill. This is the rule most easily broken and the one that most changes how the product reads.

- One primary CTA per screen or bounded panel. Nothing else.
- Also allowed: the active stepper step, the selected bottom-nav item, and the map route/highlight.
- Navigation, secondary buttons, filters, inputs, tabs, and routine controls stay black/white/charcoal.
- Yellow buttons use black text and a clear verb.
- No yellow page backgrounds and no large black slabs in Light. In Dark, cards must stay visibly elevated from the canvas — never let a surface disappear into black.

### Status

Color never carries meaning alone. Every status is **icon + label + color**: "Approved", "Blocked", "Needs correction", "Last updated 3 min ago". A screen must stay fully readable in grayscale.

### The states that are actually shipped

Loading, empty and failed are most of what a shop sees on a bad connection, so they are components rather than improvised per screen: `components/Skeleton.tsx` (placeholders in the shape of what is coming — never a bare spinner), `components/EmptyState.tsx` (an invitation to act), `components/ErrorNotice.tsx` (inline, when the screen still has something to show), `components/BusyOverlay.tsx` (a scrim over a screen that stays, for a commit of several requests).

A skeleton must hold the height of the content that replaces it, or the page grows under the thumb on arrival and reads as a jump. Its shimmer is a highlight travelling across the shape at about a second a pass: the 160–240ms budget governs transitions, where slowness reads as lag, and this is ambient — run at transition speed it would strobe, which is why a still placeholder was tried first. Reduced motion leaves the placeholder and drops the sweep. A screen that has loaded once keeps its content and states the failure quietly; a screen with nothing yet gets the full empty state.

A disabled yellow button is not a state — if there is nothing to save, do not draw the action at all.

### Type

Satoshi for all UI. The four cuts in `assets/fonts/` are embedded at prebuild by the `expo-font` config plugin `fonts` array in `app.json` (Android family name = filename without extension) and loaded at runtime for Expo Go by `useFonts` in `hooks/useAppFonts.ts`. A bare `"expo-font"` plugin string embeds nothing, and a release APK then falls back to the system UI font. Names live in `constants/fonts.ts` — styles must use `Satoshi-Bold`, never `Satoshi` plus a weight. Poppins ExtraBold is brand display only; Instrument Serif is rare decorative text only — never labels, data, or controls.

Scale: display 32/38, H1 28/34, H2 24/30, H3 20/26, body large 16/24, body 14/20, caption 12/16, button 14/20 bold, overline 12/16 medium. Nothing essential goes below 12px.

### Layout and motion

| Token | Value |
|---|---|
| Spacing base | 4px increments; standard gaps 8, 12, 16, 24, 32 |
| Page padding | 16px |
| Radius | Fields 12; cards 12–16; pills 999. Do not mix arbitrary values |
| Elevation | Border first. Use a subtle shadow only when a border cannot carry the separation |
| Touch target | 44 × 44px minimum for every tappable control |
| Motion | 160–240ms ease-out; respect reduced motion |
| Loading shimmer | ~1s sweep — ambient, not a transition (`components/Skeleton.tsx`) |

No essential state may be communicated by animation alone.

### Theme

Light and Dark are the same product with different presentation — identical navigation, labels, states, validation, and workflows. Follow the system preference with an in-app override.

---

## Styling Rules

Use NativeWind classes. Do not use StyleSheet unless it is not possible to style with className.

Use the NativeWind version installed in this project. Check package.json. Do not upgrade without approval.

Reuse class patterns through utilities in global.css.

**A class that names a token this project never defined is not an error — it compiles to nothing.** `global.css` resets Tailwind's colour, type, radius, weight and shadow scales to `initial`, so `text-2xl`, `font-satoshi-bold`, `font-semibold`, `rounded-full` and `bg-blue-500` are silent no-ops: the element renders in the system font at the browser's default size. This shipped on the login screen of all three GRIDGO apps before anyone noticed. `lib/__tests__/designSystem.test.ts` now reads `global.css` and fails when any class in `app/` or `components/` cannot resolve — run the tests before believing a screen looks the way you wrote it.

### Style Exception List

Use StyleSheet or inline styles for:

- SafeAreaView (className not supported)
- KeyboardAvoidingView (behavior props)
- Modal (visible, transparent props)
- Animated.View (animated style values)
- Dynamic styles calculated at runtime
- Platform specific styles
- Pressable or TouchableOpacity pressed states
- Shadows (different per platform)

Everywhere else, use NativeWind.

---

## Image Rule

Use centralized image imports.

1. Check if constants/images.ts exists.
2. If not, create it.
3. Import all app images there.
4. Use them through the centralized object.

```ts
import mascot from "@/assets/images/mascot.png";

export const images = {
  mascot,
};
```

```tsx
<Image source={images.mascot} />
```

Do not import image assets directly inside screens or components.

---

## State Management

- Zustand for global client state.
- Local state for temporary UI state.
- AsyncStorage for persistence.

---

## TypeScript

- Strict mode.
- No `any`.
- Keep types simple and readable.
- TypeScript 6 does not auto-include `@types/*`. `tsconfig.json` lists `jest` and `node`.

---

## Feature Implementation

When building a feature:

1. Read this file first.
2. Identify the files to change.
3. Keep changes focused.
4. Do not rewrite unrelated code.
5. Follow existing patterns.
6. Make sure the feature works end to end.
7. Fix lint and type errors before finishing.

---

## Secrets

- Never expose secret keys in client code.
- Use server routes for tokens, AI calls, and any external API access.

---

## Authentication

Clerk owns production identity; `gridgo-api` owns the supplier projection and all domain authorization. `lib/api.ts` asks Clerk's token provider for a fresh JWT on each request, upload and stream connection, while the local bearer path exists only for the `__DEV__` fixture.

One account serves a person across every GRIDGO app, and the platform role (`client`, `supplier`, `rider`, `ops_admin`, `super_admin`) is the server's to set — read it, never write it.

This app serves `supplier`. Check the role once, at the door, and hand a non-supplier account off to its own app by name (`appForRole`), never by naming the platform's role string. That check decides what renders, nothing more: every read and write is authorized server-side, so removing it would grant no access.

**A shop applies here.** Public apply creates a Clerk session then `POST /auth/clerk/enroll/supplier`; Operations still has to approve before matching. Do not write `gridgoRole` client-side. Invitation accept is a secondary path for shops Operations already invited. Clients and riders use their own GRIDGO apps — this binary does not mention their sign-up.

---

## Shipping the APK

- **The APK shops sideload is built, proved, and published by CI.** `.github/workflows/android-release.yml`: a merge to `main` (or a manual dispatch) runs `expo prebuild` → `assembleRelease` → `scripts/verify-release-apk.sh` → GitHub Release and an upload to the captain's server over the deploy key's forced command (`upload-apk supplier`, bytes on stdin), then the run artifact (`continue-on-error`, so Actions storage quota cannot fail the job after a successful signed build). `android/` is generated, never committed — `.gitignore` keeps it out and a checked-in copy drifts from `app.json` on every Expo upgrade — so `npx expo config --type public` has to gate the build. Two failures are invisible in a green log and both are asserted against the built APK rather than trusted: Expo's generated `android/app/build.gradle` points the release build type at `signingConfigs.debug`, so signing comes from AGP's injected config and the APK's certificate is then compared to the keystore alias; and **`EXPO_PUBLIC_*` values are inlined by Babel at bundle time, not read at runtime**, so `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY`, and `EXPO_PUBLIC_CARTO_API_KEY` must be in the environment of every command that evaluates app config or bundles JS — `expo config`, `expo prebuild`, and gradle. Extra is written at prebuild; a static `process.env` read in JS is what Gradle can still inline if extra was empty. Set only on a later step, or only on gradle after a keyless prebuild, and the APK silently falls back to the loopback base in `lib/api.ts` (or ships without the live Clerk key). The URL and the live Clerk publishable **values** are grepped out of `assets/index.android.bundle`. A surviving `EXPO_PUBLIC_API_URL` **identifier** means the URL was not inlined. Do not fail solely because operator-facing copy mentions another `EXPO_PUBLIC_*` name — that is what blocked the Clerk merges after the key was already baked. `__tests__/releaseWorkflow.test.ts` fails the build if any of that moves. Triggers earn different outputs: a pull request gets config, typecheck and tests and references no secret at all; only the default branch names a Release or replaces what the download page serves. This mirrors `gridgo-rider`'s workflow deliberately — fix a fleet-wide release problem in both, not one.

- **A sideloaded build must not call itself 1.0.0 forever.** There is no store listing to tell two APKs apart, and Android refuses to install over an equal `versionCode`. So `app.config.ts` — which now sits over `app.json` and is the config Expo actually evaluates — stamps a build identity: `app.json` keeps MAJOR.MINOR as the release line, CI's run number owns the patch segment and the `versionCode` (`GRIDGO_BUILD_NUMBER`). Locally the `app.json` version stands unchanged, so nothing on a developer's machine pretends to be a release. The rule lives in `app.config.ts` rather than `lib/` because @expo/config's loader will not resolve an extensionless relative `.ts` import and the `.ts` spelling that does resolve is a `tsc` error; `__tests__/appConfigVersion.test.ts` tests it where it runs.

---

## Communication

Be concise. Explain what changed and how to test it.

---

## Final Reminder

Before every feature:

- Read this file.
- Follow it strictly.
- Build clean, simple code.
- Replicate UI exactly when designs are provided.

---

## Maintaining this file

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
