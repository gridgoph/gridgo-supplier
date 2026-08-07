# Onboarding Screen — Progress and Open Items

**Spec:** `docs/superpowers/specs/2026-08-04-onboarding-screen-design.md`
**Plan:** `docs/superpowers/plans/2026-08-04-onboarding-screen.md`
**Branch:** `dev`
**Last updated:** 2026-08-04

---

## Status

The onboarding screen, the brand lockup, the illustration set, and the route
launcher are all built and pushed. **No tests were written for any of it** —
see [Open items](#open-items).

| Commit | What |
|---|---|
| `3fd4d96` | Standardised on `lucide-react-native`; stood up the Jest harness; migrated `StatusChip` off `@expo/vector-icons` |
| `4a83b7c` | Folded the harness findings into the plan |
| `59a9fe7` | Corrected the plan's SVG test queries against RNTL 14 |
| `c128a76` | Onboarding screen + route launcher; design system moved to its own route |
| `4061a75` | One illustration per beat, derived recolour, hero cross-fade stack |
| `17fdbe8` | Put a person on the approve beat |

Routes: `/` (launcher), `/onboarding`, `/design-system`.

---

## How the work was executed

The plan was written for subagent-driven execution with a TDD gate per task.
**Task 1 completed that way** — implemented, reviewed, approved. Partway
through Task 2 the direction changed to UI-first with no tests, so the task
loop was suspended and Tasks 2–7 were delivered directly.

That is why the plan document describes a test-per-task flow that the shipped
code does not have. The plan is still accurate about *what* to build; treat
its test sections as pending work rather than as a record of what happened.

---

## Verification actually performed

- `npx tsc --noEmit` — clean
- `npm run lint` — clean
- All three onboarding slides plus the launcher and design-system routes
  rendered in **both themes** via Expo web driven by Playwright, console
  checked for errors on every frame — clean
- Yellow budget confirmed by eye at four spends per screen: logo corner dot
  (`brandLogo`), the wordmark `GO` (`brand`), the active pagination dot
  (`actionYellow`), the primary CTA (`actionYellow`)

**Not** performed: any unit or integration test of the onboarding screen,
the brand lockup, the pagination dots, or the illustrations.

---

## Open items

### 1. No tests for the onboarding work

The only test in the repo is `components/__tests__/StatusChip.test.tsx`.
Everything in `c128a76` and later is unverified by automated test.

### 2. `Appearance.setColorScheme` is a no-op under jest-expo

This is the blocker that stopped Task 2's test suite, and it will stop any
future dark-mode test.

`hooks/useTheme.ts`'s `useThemeName()` reads `Appearance.getColorScheme()`.
Under jest-expo, `Appearance.setColorScheme("dark")` does not change what
`getColorScheme()` returns — it stays `null` — so the theme always resolves to
`"light"` and dark mode never renders. Isolated with a standalone probe; no
mocking was involved.

Fix when testing resumes: `jest.mock` the
`react-native/Libraries/Utilities/Appearance` module so the getter is
controllable.

### 3. The illustration generator is not in the repo

`assets/illustrations/*.svg` are the tracked sources and
`components/illustrations/*Illustration.tsx` are the tracked outputs, but the
script that converts one to the other lives only in a local scratch directory.
Regenerating on another machine is currently not possible.

If the illustrations need to change, either commit the generator under
`scripts/` or accept that the generated components are now hand-maintained.

### 4. The plan's generator section is out of date

The plan describes a converter that handles `<path>` only. The real sources
also contain `<circle>`, `<ellipse>`, `<rect>`, `<polygon>` and `<polyline>` —
the scooter alone has 57 circles, 4 ellipses and 2 polylines, which would have
rendered a scooter with no wheels. The shipped generator handles all shape
types; the plan text was never updated to match.

### 5. Minor, from the Task 1 review

The Task 1 report states `react-test-renderer` is "not installed". It is in
fact present as a transitive dev dependency of `jest-expo`, just unused by the
render path. Wording only, no code impact.

---

## Harness facts worth keeping

Each of these was established empirically against the installed packages, and
each cost real time to discover. They apply to any future test in this repo.

1. **`render` and `unmount` are async.** `@testing-library/react-native@14`
   made them async by default. A synchronous `render(<X />)` returns a pending
   promise and the next line fails with "`render` function has not been
   called". Every `it` callback must be `async`, and every `render` /
   `unmount` awaited.

2. **RNTL 14 removed every `UNSAFE_*` query.** `UNSAFE_getAllByType` and
   `UNSAFE_root` do not exist. Descendants come from
   `screen.root?.queryAll(predicate)` — `test-renderer@1.2.0`'s `TestInstance`
   API — where `node.type` is the **host component name as a string**.

3. **`react-native-svg` host nodes carry a processed colour, not your hex
   string.** `<Circle fill="#1A1A1A" />` renders host type `RNSVGCircle` with
   `props.fill === { type: 0, payload: 4279900698 }`. `<Path>` renders
   `RNSVGPath` the same way. Compare against `processColor(token)` from
   `react-native` and read `props.fill?.payload`. Confirmed:
   `processColor("#1A1A1A") === 4279900698`, `processColor("#FFDE58") ===
   4294958680`.

4. **Change the colour scheme with nothing mounted.**
   `Appearance.setColorScheme` in an `afterEach` fires the
   `useSyncExternalStore` subscription of a still-mounted component and
   produces an `act()` warning. Set it in `beforeEach` and reset in `afterAll`.
   (Subject to item 2 above — it will not actually switch the theme.)

5. **ESM-only packages need a `moduleNameMapper` entry**, not just
   `transformIgnorePatterns`. `jest-expo`'s transform only matches
   `\.[jt]sx?$`, so it never touches `.mjs`; `transformIgnorePatterns`
   controls what Jest *skips*, not what a transform *matches*. `package.json`
   already maps `lucide-react-native` to its CJS build for this reason.

6. **`jest-expo` is pinned to `^54.0.17`** to track the Expo SDK major. Do not
   let a tool upgrade it — `jest-expo@57` requires `react@^19.2.3` and this
   project is on `19.1.0`.

7. **NativeWind `className` produces no styles under Jest.** It resolves
   through Metro, not Babel, and there is no Metro in a test run. Never assert
   on className-derived styling — such tests fail, or pass vacuously. Assert
   on structure, accessibility props, behaviour, and explicitly passed props.

8. **Lucide forwards `testID` as `data-testid`**, which never reaches
   `react-native-svg` and is invisible to RNTL's `getByTestId`. Wrap the icon
   in a plain `View` carrying the id, as `components/StatusChip.tsx` does.

---

## Deferred by design

Listed so nobody adds them opportunistically:

- **Once-only gating** (`hasSeenOnboarding`). Waits for the Zustand session
  store so it is not written twice.
- **Role selection.** Clerk owns role; a pre-auth picker would duplicate auth
  state.
- **Removing `@expo/vector-icons`** from `package.json`. React Navigation may
  resolve it internally. No first-party file imports it.
- **Rider and supplier onboarding.** Role gating delivers those after sign-in.
- **The launcher route itself.** `app/index.tsx` is scaffolding; the client
  home screen replaces it once auth lands.
