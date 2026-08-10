# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v54.0.0/ before writing any code.

You are an expert React Native and Expo engineer helping me build GRIDGO.

Write clean, simple, maintainable code. Prioritize clarity over unnecessary abstraction.

Think like a senior mobile developer.

---

## Project Overview

This repo is **GRIDGO Supplier** — the supplier mobile app for a Davao City managed-printing marketplace. It covers time-sensitive job alerts, accept/decline, production updates, self-QC evidence, pickup handoff, and payout notifications.

GRIDGO ships one app per role. Client, Rider, Operations, and Super Admin surfaces live in separate codebases. Do not put client request flows, rider dispatch, or Operations QA into this binary.

The app includes:

- Self sign-up, with categories ranked best-first, and an approval a shop waits for
- Assignment inbox with accept / decline inside SLA, where accepting names the shop's own price
- Approved specification and artwork review (read-only of QA-approved files)
- Production progress, self-QC, and Proof of Fulfilment against each payout milestone
- Pickup handoff readiness
- Earnings: four milestones per job, each gated on evidence

**Cross-cutting**

- Auth via the replaceable local demo API (`gridgo-api`). Role must be `supplier`.
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
- Local **custom auth + domain API** via `gridgo-api` (MVP — not Clerk/Supabase/PayMongo; replaceable later)

Do not introduce new major libraries unless there is a strong reason. Ask before installing anything new.

---


## MVP stack (current phase)

For this MVP we **do not** integrate Clerk, Supabase, PayMongo, or other production SaaS.

Every screen that needs network uses **`lib/api.ts`** against the shared local **`gridgo-api`**:

- **Operational model v2** — `gridgo-api`'s `docs/OPERATIONAL_MODEL_V2_API.md` is the authoritative contract for routes, states, role authorization and money. Read it before changing any flow; it supersedes anything older that disagrees. The supplier proof-to-client loop, cash on delivery, and Pilot Credits as a payment method are all **retired** — do not reintroduce them.
- **Custom auth** — email/password → bearer token; role enforced in Zustand session (`store/session.ts`). Mismatched role is rejected (no role switcher). Shops **sign themselves up** (`POST /auth/signup`); Operations no longer creates accounts.
- **Session → routes** — `Stack.Protected` in `app/_layout.tsx` (SDK 54) guards on three states, not two: signed out, signed in but **not accredited**, and matchable. A shop that has signed up is signed in while `verificationStatus !== "approved"`, and `/jobs` returns nothing for it — so it gets `app/accreditation.tsx` rather than a tab shell whose every tab would be empty for a reason none of them explains (`isMatchable` in `store/session.ts`). Do not sprinkle `router.replace` on logout/401; clearing `user` is enough.
- **Files** — `gridgo-api`'s `docs/STORAGE_API.md` is the authoritative contract; read it before touching `lib/files.ts`. Upload streams from the device URI (`expo-file-system/legacy` `createUploadTask`) and a file is stored only when a `201` returns `file.fileId`. Attaching a `fulfilment_proof` names a `milestoneCode` and moves **money, not state** — the order does not transition.
- **API base** — `getApiBase()` / `resolveApiBase()` in `lib/api.ts`: `EXPO_PUBLIC_API_URL` override, else hostname from Expo `hostUri` (so physical Expo Go uses the LAN IP), Android loopback remapped to `10.0.2.2`, port from `EXPO_PUBLIC_API_PORT` (default `8787`). Do not hardcode a developer LAN IP.
- **Zustand** — session and feature stores (not React Context for global session).
- **Money** — PHP minor units only, formatted at the edge. The client pays a 75% digital downpayment then a 25% digital balance; neither is this app's business. What **is**: the shop's own `supplierPriceMinor` and its milestone `amountMinor`. GRIDGO's commission is withheld from this app by the server's role projection, so if a field here ever looks like commission, the wrong field was read. Milestone shares split the shop's price, never the client's total.
- **Replace later** — keep the same `lib/api.ts` surface when Clerk/Supabase/PayMongo land.
- **`expo start --web`** — the web bundle throws `Cannot use 'import.meta' outside a module` before it hydrates: zustand v5's devtools middleware ships `import.meta.env`, and Metro emits it into a classic `<script>`. Only web is affected; iOS/Android are fine. To render the app in a browser (screenshots, visual review) put a proxy in front of the dev server that rewrites that token. Signed-in routes also bounce to `/login` on a hard reload because the guard runs before the session rehydrates, so navigate in-app rather than reloading a deep link.

Product scope for this binary: **`PRD.md`**. Fleet blueprint: `gridgo-tinker`.

## Where the rules live

Prefer these modules over burying logic in screens:

- `lib/jobState.ts` — the only place a raw order state becomes a label, an action, or a journey step. `actionsForJob` takes the **order**, not the state, because what a shop should do next depends on which evidence it still owes: an outstanding Proof of Fulfilment takes the yellow and demotes the forward step, since half a job's money waits on a photo. `targetState: null` means the step is not a transition. `waitingOn` says whose move it is when the shop has none. `presentTimelineNote` translates the check codes the platform composes into its own notes — a failed pickup arrives as `visible_defects` and would otherwise land on a shop's timeline verbatim.
- `lib/milestones.ts` — the only place that reads `payoutMilestones`, and the source of the payout vocabulary. Two platform rules shape every screen built on it: shares split the **shop's** price, and **nobody in this app releases money** — a shop files evidence, Operations releases, so "done" here means *evidence filed* and no copy may imply the money has moved. Who owes which proof is fixed: the shop for printing and packing, the rider for delivery, and retention inherits the delivered proof. A milestone the job has not reached yet reads "Not started", never "Proof needed" — a chip asking for work nobody can do teaches a shop to ignore the chips that matter.
- `lib/signup.ts` + `components/CategoryRankList.tsx` — a shop declares categories **best first**, and list position *is* the rank (the platform requires `1..n` with no gaps). Sign-up cannot read `GET /taxonomy` because that route needs a bearer and nobody has signed in yet, so the categories come from `data/serviceCatalog.ts`; the platform re-checks every code and is the authority. `data/davaoAreas.ts` exists for the same reason — the shop pin is required, this app has no map, so an area is picked and Operations confirms the exact pin during accreditation.
- `store/alerts.ts` — GRIDGO has **no route for marking a notification read**; `GET /notifications` is the whole surface. Dismissal is therefore a decision this device remembers, persisted, and the screen says so rather than implying it synced. When the platform grows a route, this store is the one place that changes.
- `lib/taxonomy.ts` — the only place that reads the shape of `GET /taxonomy`. `gridgo-api`'s `docs/TAXONOMY_API.md` is the contract; read it before touching this. Categories, subcategories, materials and finishes are four **flat** collections and every reference is a category `code` on the referring record. Two consequences the screens are built on: a supplier service line holds one `categoryCode`, so **a shop declares a category, not a subcategory**; and a line stored before the catalogue was published still holds a retired code, so every lookup goes through `resolveCategoryCode` or accredited work vanishes from the screen. `data/serviceCatalog.ts` is the chart this app falls back to when the platform has not migrated — it is display only, and `declarable` says whether a category can be filed against at all.
- `lib/supplierServices.ts` — the draft → submitted → verified → suspended → removed vocabulary, used by both the catalogue and capacity so there is one set of words. Widening `materialCodes` on a verified line sends it back to Operations; `expandsCapability` is how a screen warns before that happens.
- `lib/apiErrors.ts` / `lib/files.ts` — the only places that read an API error code. No `snake_case`, status code, or state string may reach a screen.
- `lib/schedule.ts` + `lib/capacity.ts` + `lib/blackouts.ts` + `lib/day.ts` — agenda grouping, capacity arithmetic, and closures. Day comparisons go through `toDayKey` (local calendar), never UTC slicing.
- `store/jobDrafts.ts` / `store/shopPlan.ts` — persisted through `lib/persistStorage.ts`, which uses AsyncStorage in every real runtime and inert storage only when `typeof window === "undefined"` during web SSR. Never gate persistence on `Platform.OS`.
- `lib/navigationOptions.ts` — header chrome for the root stack and the nested `app/job/[id]` stack; both must look identical. Every pushed screen carries a `title`, or iOS labels its back control with the route group and a shop hears "(tabs)". The back control is **always `headerBackButtonDisplayMode: "minimal"`** — the captain's decision, after a crew tried labelling it "Back". That option does two jobs at once: it gives the bare chevron *and* it is what stops iOS falling back to the previous route's title, so removing it to drop a label would bring "(tabs)" back. `app/__tests__/navigationChrome.test.ts` fails on a missing title or a `headerBackTitle`.
- `hooks/usePullToRefresh.ts` — the only thing that may drive a `RefreshControl`'s `refreshing`. Every list here reloads on focus, and binding that flag to the screen's own `loading` put the platform refresh indicator on screen at every tab switch — on iOS it insets the scroll view to make room and takes it back again, so the page slid down and settled on every visit. A focus reload refreshes silently.
- Safe-area insets **stack** with design spacing, never `Math.max` with it: the inset is the OS keep-out zone and the padding is breathing room (`components/ScreenHeader.tsx` at the top, `components/GridgoTabBar.tsx` at the bottom). Taking the larger spends the whole gap on the notch.
- Bottom-bar geometry is **per platform** for the content row and **one rule** for what sits under it. Apple's tab bar is a 49pt row; Material Design 3's navigation bar container is 80dp. Under either, the space below is the system inset where the platform reserves one, and the 8dp design gap **only where it reserves none** — never both, which is the double-count that made iOS 122pt against UIKit's 83 and Android 136dp against MD3's 128. `tabBarMetrics` / `tabBarPaddingBottom` in `components/GridgoTabBar.tsx` are pure and carry the resulting heights; client, rider and supplier must carry the same numbers.
- Android reserves a bottom inset on **both** navigation modes, because `edgeToEdgeEnabled` is on (and Android 15 enforces it): measured on an API-35 device, three-button is **48dp** and gesture navigation **24dp** — the larger inset is the three-button bar, not the gesture one. A zero bottom inset on Android means the nav bar is hidden, or Expo web. Reasoning from "three-button reports nothing" is how a design gap gets added on top of an inset that was already there.
- Gestures: a swipeable must stay **mounted** across the state its own callback changes. Wrapping only the unread alerts in `ReanimatedSwipeable` tore the gesture handler out of the tree from inside its open callback and hung the app on a real device; the list also freezes its section split until the next load, so a card cannot change parent under a thumb. `components/__tests__/AlertCard.test.tsx` pins both. `GestureHandlerRootView` lives at the root of `app/_layout.tsx` — nothing gesture-driven responds on Android without it.

## Controls

Every input uses the control its data calls for, and the platform's own where the platform's *behaviour* is the point — a calendar, a keyboard, a sheet's physics. Not where it only brings geometry: a native control paints itself from the OS and cannot be told to use these radii, so it reads as borrowed, and differently borrowed on each platform. (Native modules bundled in Expo Go for SDK 54 are listed in `node_modules/expo/bundledNativeModules.json` — check it before adding another.)

- Dates → `components/controls/DateTimeField.tsx` (`@react-native-community/datetimepicker`; Android opens the dialog imperatively, iOS confirms in a sheet). Never a text box a date is typed into.
- Fixed small sets → `components/controls/SegmentedControl.tsx`; longer fixed sets → `OptionList`. The segmented control is built from tokens on purpose — `@react-native-segmented-control` was removed because iOS kept `UISegmentedControl`'s own rounding and Android's recreation hard-codes 9pt, on a screen of 12pt fields. Client and rider hold the same shape. Do not reinstall it.
- Bounded counts → `Stepper`. Money → `MoneyField` + `lib/money.ts`. Free text stays free text (`NoteField`).
- Anything irreversible → `await askConfirm({...})` from `store/sheets.ts`, with a question naming the thing. Never a bare "Are you sure?".

## Sheets and modals

A sheet is a **route**, never an overlay a screen draws. `lib/navigationOptions.ts` `sheetScreenOptions` presents one as `formSheet` sized to its content, so the platform provides the spring physics that track the finger, drag-to-dismiss, the back gesture, the scrim and its own reduced-motion handling. Nothing here re-implements any of that, and no new `<Modal>` should appear in this app.

`store/sheets.ts` is how a screen asks for one and waits: `const ok = await askConfirm({...})`, `const when = await askDate({...})`. Dismissing any way the platform allows resolves as declined — nothing is committed until the sheet's own action is pressed. The routes are `app/confirm.tsx` and `app/pick-date.tsx`; both render `components/SheetSurface.tsx`, which must never claim `flex-1` or the content-sized detent cannot measure it.

What gets which presentation:

- **Sheet** — a short question or a small step over something already on screen (a confirmation, the calendar, a production update).
- **`presentation: "modal"`** — a self-contained create/edit task with its own save and cancel (`shop-closure`).
- **Pushed screen** — a commitment with fields to read and fill (accept, decline, proof of fulfilment, self-QC, handoff), and every destination.

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

Satoshi for all UI, falling back to `system-ui` until the licensed font files are available. Poppins ExtraBold is brand display only; Instrument Serif is rare decorative text only — never labels, data, or controls.

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

For the pilot this is the local `gridgo-api`, not Clerk — see **MVP stack** above, which is what the code does. Clerk is a later replacement behind the same `lib/api.ts` surface; do not build against it yet.

One account serves a person across every GRIDGO app, and the platform role (`client`, `supplier`, `rider`, `ops_admin`, `super_admin`) is the server's to set — read it, never write it.

This app serves `supplier`. Check the role once, at the door, and hand a non-supplier account off to its own app by name (`appForRole`), never by naming the platform's role string. That check decides what renders, nothing more: every read and write is authorized server-side, so removing it would grant no access.

**Client, supplier and rider all sign themselves up.** Supplier and rider accounts then wait for Operations to approve them and are not matchable meanwhile — which is a state this app has to show honestly, not a reason to hide the sign-up path. Only Operations and Super Admin accounts are created by invitation.

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
