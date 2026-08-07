# GRIDGO Onboarding Screen — Design

**Date:** 2026-08-04
**Status:** Approved
**Scope:** A 3-slide client onboarding carousel at `/onboarding`, a brand lockup component, a recoloured hero illustration, and standardising the app on one icon library.

---

## 1. Goal

Introduce the GRIDGO client journey — order, approve, track — in three swipeable slides that look like they were built from the same spec sheet as the rest of the app. Reachable from the home route so it can be reviewed on device.

Explicitly out of scope: role selection, sign-in, and once-only gating. Those wait for Clerk and the Zustand session store. The screen is a demo route today.

---

## 2. Dependencies

Two new packages, both installed through Expo so versions match SDK 54:

| Package | Purpose | Command |
|---|---|---|
| `react-native-svg` | Peer dependency of Lucide. Also renders the grid mark and the hero illustration. | `npx expo install react-native-svg` |
| `lucide-react-native` | The app's icon system. | `npx expo install lucide-react-native` |

`react-native-reanimated` (4.1.1) and `react-native-safe-area-context` (5.6.0) are already installed and need no change.

### Icon library decision

`@expo/vector-icons` is being deprecated by Expo. It is font-based, so glyphs cannot take per-path fills, and it carries a large bundle cost. `lucide-react-native` renders real SVG, tree-shakes to only the icons imported, and its uniform 2px stroke matches GRIDGO's monochrome spec-sheet language. `components/StatusChip.tsx` already passes Lucide-style names (`check-circle`, `alert-triangle`, `x-circle`, `clock`, `edit-3`).

`components/StatusChip.tsx` migrates from `Feather` to Lucide in this change. Shipping two icon systems in one app is a worse outcome than one small targeted edit to an adjacent file.

`@expo/vector-icons` stays in `package.json` because React Navigation may resolve it internally. After this change no first-party file imports it. Removing it is a separate follow-up, not part of this work.

---

## 3. Brand lockup

`components/GridgoLogo.tsx` exports two things:

- `GridgoMark` — the 3×3 grid mark alone, `size` prop, drawn with `react-native-svg`. Reusable later for the app icon and splash screen.
- `GridgoLogo` — `GridgoMark` plus the wordmark, composed in a row.

### Mark

Nine circles in a 3×3 grid. Gap and radius scale from the `size` prop so the mark stays correct at any size.

| Position | Token | Light | Dark |
|---|---|---:|---:|
| Rows 1–3, columns 1–2 (six dots) | `accent` | `#1A1A1A` | `#F0F0F0` |
| Row 1, column 3 (corner dot) | `brandLogo` | `#FFDE58` | `#FFDE58` |
| Rows 2–3, column 3 (two dots) | `textMuted` | `#7A7A7A` | `#808080` |

`accent` inverts per theme, so the source artwork's white circles render black in Light and white in Dark. The corner dot holds `#FFDE58` in both themes.

Colours come from `useThemeColors()`. `react-native-svg` props are not reachable by NativeWind classes, which places this on the AGENTS.md style exception list.

### Wordmark

`GRID` in `accent`, `GO` in **`brand`** — not `actionYellow`.

Two reasons. `#FFDE58` on the `#F8F8F8` light canvas fails legibility; `brand` resolves to `#FFDE587` in Light and `#FFDE58` in Dark, so the `GO` reads as yellow in both themes. And `brand` is the token the design system already reserves for "small links and badges", which leaves `actionYellow` free for the screen's single call to action.

Set in `font-brand` (Satoshi-Black until Poppins ExtraBold is licensed), at the `h3` step.

---

## 4. Hero illustration

Source: `~/Downloads/lukasz_adam_illustrations/lukasz_adam_illustrations/01_illustrations/scooter_illustrations/SVG/Asset 1.svg` — 28K, 93 paths, 13 distinct fills, no clip-paths.

It was chosen over the other candidates because it is the only asset in the pack whose fill count survives reduction to a five-step palette without the shapes losing separation. `package_service` (42 fills) and `image_guy` (34 fills) collapse into grey mush; `storefront` additionally carries 13 clip-paths.

### Palette

Five steps, all existing tokens, forming a clean luminance ramp in both themes:

| Role | Token | Light | Dark |
|---|---|---:|---:|
| `ink` — outlines | `accent` | `#1A1A1A` | `#F0F0F0` |
| `shade` — dark planes | `textSecondary` | `#4A4A4A` | `#CCCCCC` |
| `mid` — mid planes | `textMuted` | `#7A7A7A` | `#808080` |
| `tint` — light planes | `outline` | `#DCDCDC` | `#2E2E2E` |
| `highlight` | `surface` | `#FFFFFF` | `#141414` |

The ramp inverts as a whole between themes, so the illustration reads as line art on dark and as filled art on light without any per-theme authoring.

### Class → token map

Derived from the source `<style>` block and usage counts:

| Class | Source fill | Uses | Maps to |
|---|---|---:|---|
| `cls-4` | `#000201` | 53 | `ink` |
| `cls-2` | `#048edd` | 26 | `mid` |
| `cls-5` | `#fff` | 24 | `highlight` |
| `cls-12` | `#253b4a` | 14 | `shade` |
| `cls-16` | `#35545b` | 6 | `shade` |
| `cls-13` | `#253b4a` @ .35 | 6 | `shade`, opacity `.35` |
| `cls-15` | `#3ec4ff` | 5 | `tint` |
| `cls-8` | `#6b838c` | 3 | `mid` |
| `cls-17` | `#a1bcc4` | 3 | `tint` |
| `cls-11` | `#d9e1e4` | 3 | `tint` |
| `cls-3` | `#048edd` @ .5 | 2 | `mid`, opacity `.5` |
| `cls-7` | `#fc884f` | 1 | `mid` |
| `cls-6` | `#fc691f` | 1 | `shade` |
| `cls-14` | `#253b4a` @ .4 | 1 | `shade`, opacity `.4` |
| `cls-1` | `#f8fffb` | 1 | `highlight` |

**Dropped:** `cls-9` and `cls-10` (`#c2efff` pale-blue cloud blobs, 7 uses) and the `cls-18` opacity group that wraps them. They are stock-art atmosphere that fights the spartan spec-sheet look, and at 40% opacity in the GRIDGO ramp they would render nearly invisible in both themes anyway. Removing them also shrinks the generated component.

**The illustration carries no yellow.** The original orange seat (`cls-6`, `cls-7`) becomes a grey plane. This is what keeps the yellow budget honest — see §7.

### Build

A one-time transform, run from the scratchpad, emits `components/illustrations/ScooterIllustration.tsx`. It rewrites `class="cls-N"` to `fill={palette.x}` plus an `opacity` prop where the source class carries one, maps `<path>`/`<g>` to `<Path>`/`<G>`, preserves the `viewBox="0 0 659.89 509.94"`, and drops the blob group.

The transform script is not committed. Only the generated component is. There is no `react-native-svg-transformer` dependency and no raster asset.

The component signature:

```ts
type IllustrationPalette = {
  ink: string;
  shade: string;
  mid: string;
  tint: string;
  highlight: string;
};

function ScooterIllustration(props: { width: number; height: number; palette: IllustrationPalette }): JSX.Element
```

Nothing on this screen is a bitmap, so `constants/images.ts` is not created. The AGENTS.md image rule applies when raster assets are imported; there are none.

---

## 5. Screen

Route: `app/onboarding.tsx`. Registered in `app/_layout.tsx` with `headerShown: false`.

### Layout

```
┌────────────────────────────────┐
│ ●●◉ GRIDGO               Skip  │  header, 16px page padding
│                                │
│        [ scooter ]             │  flex-1, parallax at 0.5x
│                                │
│ ──────────────────────────     │  hairline, outline
│ 01 / 03                        │  overline, textMuted
│ Order print                    │  h1, textPrimary
│ the right way                  │
│ Pick the product, size,        │  body-lg, textSecondary
│ material and deadline...       │
│                                │
│ ▬ · ·                          │  pagination dots
│ [       Next       ]           │  PrimaryButton
└────────────────────────────────┘
```

The hairline rule and the `01 / 03` overline come from the spec-sheet language already established in `app/index.tsx`. They make onboarding read as the same product rather than a bolted-on template, and they state slide position in text rather than in colour alone.

`SafeAreaView` with `edges={["top", "bottom"]}`, `backgroundColor: colors.canvas` as an inline style (style exception list).

### Structure

The illustration is a single fixed layer behind the scroller, not one copy per page. The header and the footer (dots plus CTA) are also fixed. Only the text block lives inside the horizontal pager, so the three regions can move at three different rates.

### Active index

Parallax and the dot morph read `scrollX` directly on the UI thread. The CTA *label* cannot — it is React state.

So the screen keeps both: a `scrollX` shared value for animation, and an `index` React state updated in `onMomentumScrollEnd` from the content offset. `index` drives only the CTA label and the accessibility `selected` state. It deliberately does not drive the dot widths, which stay on the shared value so they track the gesture continuously rather than snapping at page boundaries.

The CTA and the dots both move the pager by calling `scrollTo({ x: i * width, animated: true })` on an `Animated.ScrollView` ref.

### Content

`data/onboarding.ts`, typed:

```ts
export type OnboardingSlide = {
  id: string;
  step: string;      // "01 / 03"
  title: string;
  body: string;
  cta: string;
};
```

| # | Step | Title | Body | CTA |
|---|---|---|---|---|
| 1 | `01 / 03` | Order print the right way | Pick the product, size, material and deadline in four steps. No back-and-forth on Messenger. | Next |
| 2 | `02 / 03` | Approve before it prints | Every file runs a preflight check. You see the proof and approve it, or send it back for changes. | Next |
| 3 | `03 / 03` | Watch it come to you | Track your rider on the map with a live ETA, and an honest note when the location goes stale. | Get Started |

`Skip` sits top-right as a text link in `textSecondary` with a 44×44 hit area. It is never a second yellow. Both `Skip` and the final `Get Started` call `router.back()`.

---

## 6. Motion

`Animated.ScrollView`, horizontal, `pagingEnabled`, `showsHorizontalScrollIndicator={false}`. A `useAnimatedScrollHandler` writes `scrollX` as a shared value.

| Element | Behaviour |
|---|---|
| Illustration | `translateX: -scrollX * 0.5` — parallax depth |
| Text block | Moves at 1x with the pager; `opacity` interpolates to fade at page edges |
| Active dot | Width interpolates `8 → 24`, colour `outline → actionYellow` |

Timing 200ms ease-out, inside the 160–240ms band.

`useReducedMotion()` from `react-native-reanimated` collapses the parallax and the dot morph to instant state changes. No essential state is animation-only: the `01 / 03` overline states slide position in text, so the screen remains fully readable with motion disabled and in grayscale.

`components/PaginationDots.tsx` takes `count`, `scrollX`, and `onPress(index)`. Dots are tappable as well as swipeable.

---

## 7. Yellow budget

The screen spends yellow exactly four times, each under a rule the design system already grants:

| Element | Token | Justification |
|---|---|---|
| Logo corner dot | `brandLogo` | `constants/theme.ts` reserves this token for the GRIDGO logo dot only |
| Wordmark `GO` | `brand` | "Small links and badges" — and `#FFDE587` in Light, which is a different value from `actionYellow` |
| Active pagination dot | `actionYellow` | The "active stepper step" carve-out |
| Primary CTA | `actionYellow` | The one primary action on the screen |

Everything else — `Skip`, the header, the hairline, the entire illustration — stays monochrome. The illustration carrying no yellow is the decision that makes this budget work; a yellow scooter seat would have been a fifth spend with no rule behind it.

---

## 8. Accessibility

- Pagination dots: container `accessibilityRole="tablist"`, each dot `accessibilityRole="tab"` with `accessibilityState={{ selected }}` and label `"Slide 1 of 3"`. Visual dot is 8px; hit area is padded to 44×44.
- Slide title: `accessibilityRole="header"`.
- Illustration: decorative. `accessibilityElementsHidden` and `importantForAccessibility="no-hide-descendants"` — the text carries all meaning.
- `Skip` and the CTA: `accessibilityRole="button"` with clear verb labels.
- Every tappable control clears 44×44.

---

## 9. Files

**New**

| Path | Purpose |
|---|---|
| `app/onboarding.tsx` | The screen |
| `data/onboarding.ts` | Typed slide content |
| `components/GridgoLogo.tsx` | `GridgoMark` and `GridgoLogo` |
| `components/illustrations/ScooterIllustration.tsx` | Generated, recoloured hero |
| `components/PaginationDots.tsx` | Reanimated morphing dots |

**Modified**

| Path | Change |
|---|---|
| `app/_layout.tsx` | Register `onboarding` with `headerShown: false` |
| `app/index.tsx` | `SecondaryButton` link to `/onboarding` below the theme switch |
| `components/StatusChip.tsx` | `Feather` → Lucide |
| `package.json` | Two new dependencies |

---

## 10. Verification

1. `npx tsc --noEmit` clean. Strict mode, no `any`.
2. `npm run lint` clean.
3. On device: swipe all three slides forward and back; parallax tracks the gesture.
4. Tap each dot; the pager moves to that slide.
5. Toggle Light / Dark on the home route, then open onboarding. Confirm the mark inverts, `GO` stays legible in both, and the illustration keeps five distinguishable tones in both.
6. Enable Reduce Motion at the OS level; confirm paging still works and nothing animates.
7. Screenshot both themes and check the screen still reads in grayscale.
8. `Skip` and `Get Started` both return to `/`.

---

## 11. Deferred

- Once-only gating (`hasSeenOnboarding` in a persisted Zustand store) — waits for the session store so it is not written twice.
- Role selection — Clerk owns role; a pre-auth role picker would duplicate auth state.
- Removing `@expo/vector-icons` from `package.json`.
- Rider and supplier onboarding — role gating delivers those after sign-in.
