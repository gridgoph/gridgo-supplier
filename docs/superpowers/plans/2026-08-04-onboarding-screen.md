# GRIDGO Onboarding Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a 3-slide client onboarding carousel at `/onboarding`, reachable from the home route, and standardise the app on one icon library.

**Architecture:** A fixed illustration layer parallaxes behind a horizontal paged `Animated.ScrollView` that carries only the text. Header and footer are fixed. Animation reads a `scrollX` shared value on the UI thread; a separate React `index` state drives only the CTA label and accessibility selected state. Brand mark and hero illustration are `react-native-svg` components taking theme colours as props.

**Tech Stack:** Expo SDK 54, React Native 0.81, TypeScript strict, Expo Router 6, NativeWind 5 preview, react-native-reanimated 4.1.1, react-native-svg, lucide-react-native, jest-expo + @testing-library/react-native.

**Spec:** `docs/superpowers/specs/2026-08-04-onboarding-screen-design.md`

## Global Constraints

Every task's requirements implicitly include this section.

- **Read `AGENTS.md` before starting any task.** It is the project brief and overrides defaults.
- **Never hard-code a hex value** in a screen or component. Consume tokens by semantic name from `constants/theme.ts` (via `useThemeColors()`) or NativeWind classes backed by `global.css`.
- **Style with NativeWind classes.** Use `StyleSheet`/inline styles only for the AGENTS.md exception list: `SafeAreaView`, `Animated.View` animated style values, dynamic runtime values, `Pressable` pressed states, shadows, platform styles. `react-native-svg` props are not reachable by classes and are also an exception.
- **TypeScript strict. No `any`.**
- **Touch targets:** every tappable control clears 44 × 44 px.
- **Motion:** 160–240 ms ease-out. Respect reduced motion. No essential state communicated by animation alone.
- **The yellow rule.** This screen spends yellow exactly four times and no more: the logo corner dot (`brandLogo`), the wordmark `GO` (`brand`), the active pagination dot (`actionYellow`), the primary CTA (`actionYellow`). The illustration carries **no** yellow.
- **Do not install anything beyond what Task 1 lists.**
- **Commit after every task.** End commit messages with:
  `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`

### Testing constraints (read once, applies to every task)

NativeWind resolves `className` through Metro, not Babel. Under Jest there is no Metro, so **`className` does not produce styles in tests.** Do not write tests that assert on className-derived styling — they will fail or, worse, pass vacuously.

Test only these:

- What renders (structure, text content)
- Accessibility props: `accessibilityRole`, `accessibilityState`, `accessibilityLabel`
- Behaviour: press handlers firing with the right arguments
- **Explicitly passed props** — including `react-native-svg` `fill`/`opacity`, which is exactly how `GridgoMark` and `ScooterIllustration` carry colour

Reanimated animated style values are also not assertable under the mock. Test the component renders and is reachable; verify motion on device.

### Harness API — established by Task 1, applies to every test file

Three facts discovered and verified while standing the harness up. They are not optional style choices:

1. **`render` and `unmount` are async.** `@testing-library/react-native@14` made them async by default. A synchronous `render(<X />)` returns a pending promise, and the next line fails with "`render` function has not been called". **Every `it` callback is `async`, and every `render`/`unmount` is `await`ed.** All test code below already reflects this.
2. **Lucide forwards `testID` as `data-testid`**, which never reaches `react-native-svg` and is invisible to RNTL's `getByTestId`. If a Lucide icon needs a test id, wrap it in a plain `View` carrying the id. (No task after Task 1 renders a Lucide icon, so this should not come up.)
3. **ESM-only packages need a `moduleNameMapper` entry**, not just `transformIgnorePatterns`. `jest-expo`'s transform only matches `\.[jt]sx?$`, so it never touches `.mjs`. `transformIgnorePatterns` controls what Jest *skips*, not what a transform *matches*. If a new package fails with `SyntaxError: Unexpected token 'export'`, map it to its CJS build the way `package.json` already maps `lucide-react-native`.
4. **RNTL 14 removed every `UNSAFE_*` query.** `UNSAFE_getAllByType` and `UNSAFE_root` do not exist. Descendants come from `screen.root?.queryAll(predicate)` (`test-renderer@1.2.0`'s `TestInstance`), where `node.type` is the **host component name string**.
5. **`react-native-svg` host nodes carry a processed colour, not your hex string.** Verified empirically: `<Circle fill="#1A1A1A" />` renders host type `RNSVGCircle` with `props.fill === { type: 0, payload: 4279900698 }`. `<Path>` renders `RNSVGPath` the same way. Compare against `processColor(token)` from `react-native` and read `props.fill?.payload` — never the token string. `processColor("#1A1A1A") === 4279900698`, `processColor("#FFDE58") === 4294958680`.
6. **Change the colour scheme with nothing mounted.** `Appearance.setColorScheme` in an `afterEach` fires the `useSyncExternalStore` subscription of a still-mounted component and produces an `act()` warning. Set it in `beforeEach` instead, and reset in `afterAll`.

`jest-expo` is pinned to `^54.0.17` to track the Expo SDK major. Do not let a tool upgrade it — `jest-expo@57` requires `react@^19.2.3` and this project is on `19.1.0`.

---

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `jest.setup.js` | Reanimated test setup |
| `components/__tests__/StatusChip.test.tsx` | StatusChip behaviour |
| `components/GridgoLogo.tsx` | `GridgoMark` (SVG 3×3 grid) and `GridgoLogo` (mark + wordmark) |
| `components/__tests__/GridgoLogo.test.tsx` | Mark geometry and per-theme dot colours |
| `components/illustrations/ScooterIllustration.tsx` | Generated, recoloured hero SVG |
| `components/__tests__/ScooterIllustration.test.tsx` | Palette wiring, no stray source colours |
| `data/onboarding.ts` | Typed slide content |
| `data/__tests__/onboarding.test.ts` | Slide shape and copy invariants |
| `components/PaginationDots.tsx` | Reanimated morphing dots, tablist semantics |
| `components/__tests__/PaginationDots.test.tsx` | Tab count, selected state, press routing |
| `app/onboarding.tsx` | The screen |
| `__tests__/onboarding-screen.test.tsx` | Slide render, CTA label, dismiss wiring |

The screen's test lives at the repo root, **not** in `app/`. Expo Router builds routes from a `require.context` over `app/`, and a stray `__tests__` directory there risks being picked up as a route. Component and data tests stay colocated because those directories are not scanned.

**Modify**

| Path | Change |
|---|---|
| `package.json` | Dependencies, `test` scripts, `jest` config block |
| `components/StatusChip.tsx` | `Feather` → Lucide via a typed local registry |
| `app/index.tsx` | `SecondaryButton` link to `/onboarding` |
| `app/_layout.tsx` | Register `onboarding` with `headerShown: false` |

---

## Task 1: Test harness and icon standardisation

Folds dependency install and Jest configuration into the first real deliverable — migrating `StatusChip` off the deprecated `@expo/vector-icons`. Proving the harness against actual product code means any config surprise surfaces here rather than poisoning later tasks.

**Files:**
- Modify: `package.json`
- Create: `jest.setup.js`
- Modify: `components/StatusChip.tsx`
- Modify: `app/index.tsx:243-247` (the five `StatusChip` call sites)
- Test: `components/__tests__/StatusChip.test.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces: `StatusChip` with prop `icon: StatusIconName`, where
  `type StatusIconName = "circle-check" | "triangle-alert" | "circle-x" | "clock" | "square-pen"`.
  A working `npm test`.

**Note on icon names:** Lucide v1 **removed** the deprecated aliases. `CheckCircle`, `XCircle`, and `AlertTriangle` no longer exist. The current names are `CircleCheck`, `CircleX`, `TriangleAlert`, `Clock`, `SquarePen`. `react-test-renderer` is **not** installed — it does not support React 19, and `@testing-library/react-native` replaces it.

**The onboarding screen itself uses zero Lucide icons.** It needs `react-native-svg` only. Lucide is installed here because it is the app's icon standard going forward and `StatusChip` is its first consumer.

- [ ] **Step 1: Install dependencies**

```bash
npx expo install react-native-svg lucide-react-native
npx expo install -- --dev jest-expo jest @types/jest @testing-library/react-native
```

Expected: `react-native-svg` resolves to a 15.x version. Lucide requires react-native-svg between 12 and 15 — if Expo pins something outside that range, stop and report rather than forcing it.

- [ ] **Step 2: Add Jest config and scripts to `package.json`**

Add these two top-level keys (keep existing `scripts` entries, just add the two below):

```json
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watchAll"
  },
  "jest": {
    "preset": "jest-expo",
    "setupFilesAfterEnv": ["<rootDir>/jest.setup.js"],
    "transformIgnorePatterns": [
      "node_modules/(?!((jest-)?react-native|@react-native(-community)?)|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@sentry/react-native|native-base|react-native-svg|react-native-css|nativewind|lucide-react-native|react-native-reanimated|react-native-worklets)"
    ]
  }
```

- [ ] **Step 3: Create `jest.setup.js`**

```js
// Reanimated ships its own Jest harness. Without this, useAnimatedStyle and
// useSharedValue throw when the worklet runtime is absent.
require("react-native-reanimated").setUpTests();
```

- [ ] **Step 4: Write the failing test**

Create `components/__tests__/StatusChip.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";

import { StatusChip } from "@/components/StatusChip";

describe("StatusChip", () => {
  it("states the status in words, so colour never carries meaning alone", () => {
    render(<StatusChip tone="success" label="Approved" icon="circle-check" />);

    expect(screen.getByText("Approved")).toBeTruthy();
  });

  it("renders an icon beside the label", () => {
    render(<StatusChip tone="error" label="Blocked" icon="circle-x" />);

    expect(screen.getByTestId("status-chip-icon")).toBeTruthy();
  });

  it("accepts every icon in the registry", () => {
    const icons = ["circle-check", "triangle-alert", "circle-x", "clock", "square-pen"] as const;

    for (const icon of icons) {
      const { unmount } = render(<StatusChip tone="neutral" label={icon} icon={icon} />);
      expect(screen.getByTestId("status-chip-icon")).toBeTruthy();
      unmount();
    }
  });
});
```

- [ ] **Step 5: Run the test to verify it fails**

Run: `npm test -- StatusChip`
Expected: FAIL. `getByTestId("status-chip-icon")` finds nothing, and TypeScript rejects `icon="circle-check"` because the current prop type is `keyof typeof Feather.glyphMap`.

- [ ] **Step 6: Rewrite `components/StatusChip.tsx`**

Replace the whole file:

```tsx
import {
  CircleCheck,
  CircleX,
  Clock,
  SquarePen,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/** Maps to the semantic colour tokens. `neutral` carries no signal. */
export type StatusTone = "success" | "warning" | "error" | "info" | "neutral";

/**
 * The icons this app draws status from, keyed by their Lucide name.
 *
 * Keeping a registry rather than exposing Lucide's whole surface means call
 * sites stay stable if the icon set is ever swapped, and it keeps the chip's
 * vocabulary small enough to stay consistent across screens.
 */
const ICONS = {
  "circle-check": CircleCheck,
  "triangle-alert": TriangleAlert,
  "circle-x": CircleX,
  clock: Clock,
  "square-pen": SquarePen,
} satisfies Record<string, LucideIcon>;

export type StatusIconName = keyof typeof ICONS;

type Props = {
  tone: StatusTone;
  /** Say the state: "Approved", "Blocked", "Updated 3 min ago". */
  label: string;
  icon: StatusIconName;
};

const TONE = {
  success: { border: "border-success", text: "text-success", token: "success" },
  warning: { border: "border-warning", text: "text-warning", token: "warning" },
  error: { border: "border-error", text: "text-error", token: "error" },
  info: { border: "border-info", text: "text-info", token: "info" },
  neutral: { border: "border-outline", text: "text-text-secondary", token: "textSecondary" },
} as const;

/**
 * Colour never carries meaning alone. A status is always icon + label +
 * colour, so the screen stays readable in grayscale and to a screen reader.
 */
export function StatusChip({ tone, label, icon }: Props) {
  const colors = useThemeColors();
  const style = TONE[tone];
  const Icon = ICONS[icon];

  return (
    <View className={`gg-chip ${style.border}`} accessibilityRole="text">
      <Icon testID="status-chip-icon" size={13} color={colors[style.token]} strokeWidth={2} />
      <Text className={`text-caption ${style.text}`}>{label}</Text>
    </View>
  );
}
```

- [ ] **Step 7: Update the five call sites in `app/index.tsx`**

In the `STATUS` section, replace the five chips with:

```tsx
              <StatusChip tone="success" label="Approved" icon="circle-check" />
              <StatusChip tone="warning" label="Needs correction" icon="triangle-alert" />
              <StatusChip tone="error" label="Blocked" icon="circle-x" />
              <StatusChip tone="info" label="Updated 3 min ago" icon="clock" />
              <StatusChip tone="neutral" label="Draft" icon="square-pen" />
```

- [ ] **Step 8: Run the tests and the type check**

```bash
npm test -- StatusChip
npx tsc --noEmit
npm run lint
```

Expected: 3 tests PASS, `tsc` clean, lint clean. Confirm no file outside `node_modules` still imports `@expo/vector-icons`:

```bash
grep -rn "@expo/vector-icons" --include=*.tsx --include=*.ts app components constants hooks lib store data types
```

Expected: no output.

- [ ] **Step 9: Commit**

```bash
git add package.json package-lock.json jest.setup.js components/StatusChip.tsx components/__tests__/StatusChip.test.tsx app/index.tsx
git commit -m "feat: standardise on lucide-react-native and add a test harness

@expo/vector-icons is being deprecated by Expo and is font-based, so
glyphs cannot take per-path fills. Lucide renders real SVG, tree-shakes,
and its uniform 2px stroke matches the monochrome system.

StatusChip keeps a small local icon registry so call sites do not depend
on Lucide's naming directly.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Brand lockup

**Files:**
- Create: `components/GridgoLogo.tsx`
- Test: `components/__tests__/GridgoLogo.test.tsx`

**Interfaces:**
- Consumes: `react-native-svg` (Task 1), `useThemeColors` from `@/hooks/useTheme`.
- Produces:
  - `GridgoMark({ size?: number }): JSX.Element` — default `size` 28
  - `GridgoLogo({ size?: number }): JSX.Element` — default `size` 28

**Geometry:** viewBox `0 0 100 100`. Circle centres at 15, 50, 85 on both axes; radius 13. That gives a 9-unit gap against a 26-unit diameter — roughly 35%, matching the reference mark's proportions.

**Colour:** columns 1–2 (six dots) are `accent`, which inverts per theme so the reference art's white circles render black in Light. Row 1 column 3 is `brandLogo` (`#FFDE58` in both themes). Rows 2–3 column 3 are `textMuted`.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/GridgoLogo.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { Appearance, processColor } from "react-native";

import { GridgoLogo, GridgoMark } from "@/components/GridgoLogo";
import { colors } from "@/constants/theme";

/**
 * react-native-svg renders to host nodes named `RNSVGCircle`, and their `fill`
 * prop is a processed colour object rather than the hex string that was passed
 * in. So: find by host type name, read `fill.payload`, and compare against
 * `processColor(token)`.
 */
function circleFills(): (number | undefined)[] {
  const circles = screen.root?.queryAll((node) => node.type === "RNSVGCircle") ?? [];
  return circles.map((circle) => circle.props.fill?.payload);
}

describe("GridgoMark", () => {
  // Set the scheme while nothing is mounted, so no subscribed component
  // updates outside act().
  beforeEach(() => Appearance.setColorScheme("light"));
  afterAll(() => Appearance.setColorScheme(null));

  it("draws nine dots", async () => {
    await render(<GridgoMark />);

    expect(circleFills()).toHaveLength(9);
  });

  it("spends exactly one dot on the brand yellow", async () => {
    await render(<GridgoMark />);

    expect(
      circleFills().filter((f) => f === processColor(colors.light.brandLogo)),
    ).toHaveLength(1);
  });

  it("keeps six structural dots on the accent", async () => {
    await render(<GridgoMark />);

    expect(circleFills().filter((f) => f === processColor(colors.light.accent))).toHaveLength(6);
  });

  it("mutes the two dots below the brand dot", async () => {
    await render(<GridgoMark />);

    expect(
      circleFills().filter((f) => f === processColor(colors.light.textMuted)),
    ).toHaveLength(2);
  });

  it("inverts the structural dots in dark mode", async () => {
    Appearance.setColorScheme("dark");

    await render(<GridgoMark />);

    expect(circleFills().filter((f) => f === processColor(colors.dark.accent))).toHaveLength(6);
  });
});

describe("GridgoLogo", () => {
  it("reads as a single GRIDGO element to a screen reader", async () => {
    await render(<GridgoLogo />);

    expect(screen.getByLabelText("GRIDGO")).toBeTruthy();
  });

  it("splits the wordmark so GO can carry the brand colour", async () => {
    await render(<GridgoLogo />);

    expect(screen.getByText(/GRID/)).toBeTruthy();
    expect(screen.getByText("GO")).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- GridgoLogo`
Expected: FAIL with "Cannot find module '@/components/GridgoLogo'".

- [ ] **Step 3: Create `components/GridgoLogo.tsx`**

```tsx
import { Text, View } from "react-native";
import Svg, { Circle } from "react-native-svg";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * The GRIDGO mark: a 3x3 grid with one corner lit.
 *
 * The grid is the product — a marketplace that routes a print job across a
 * city — and the single yellow dot is the job moving through it. Six
 * structural dots, two muted, one brand.
 *
 * Drawn in SVG rather than nine Views so the same component can be exported
 * for the app icon and splash screen later. `react-native-svg` takes colours
 * as props, which classes cannot reach, so this file reads tokens directly.
 */

/** Circle centres on both axes. 26-unit diameter against a 9-unit gap. */
const CENTRES = [15, 50, 85] as const;
const RADIUS = 13;

type Props = {
  /** Rendered edge length in px. The grid scales with it. */
  size?: number;
};

export function GridgoMark({ size = 28 }: Props) {
  const colors = useThemeColors();

  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {CENTRES.map((cy, row) =>
        CENTRES.map((cx, column) => (
          <Circle
            key={`${row}-${column}`}
            cx={cx}
            cy={cy}
            r={RADIUS}
            // Columns 1-2 are structural, so they invert with the theme. Only
            // the top-right dot holds yellow, and it holds it in both themes.
            fill={
              column < 2
                ? colors.accent
                : row === 0
                  ? colors.brandLogo
                  : colors.textMuted
            }
          />
        )),
      )}
    </Svg>
  );
}

/**
 * Mark plus wordmark.
 *
 * `GO` uses `brand`, not `actionYellow`. `#FFDE58` on the light canvas is
 * illegible, and `brand` resolves to `#FFDE587` in Light and `#FFDE58` in
 * Dark — yellow in both themes, without spending the screen's one CTA colour.
 */
export function GridgoLogo({ size = 28 }: Props) {
  return (
    <View
      className="flex-row items-center gap-2"
      // Collapses the mark and both text runs into one node, so a screen
      // reader says "GRIDGO" once rather than spelling out the pieces.
      accessible
      accessibilityRole="image"
      accessibilityLabel="GRIDGO"
    >
      <GridgoMark size={size} />
      <Text className="font-brand text-h3 text-text-primary">
        GRID<Text className="text-brand">GO</Text>
      </Text>
    </View>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- GridgoLogo`
Expected: 7 tests PASS, output pristine (no `act()` warnings).

The `screen.root?.queryAll` + `processColor` pattern above is verified against the installed `@testing-library/react-native@14.0.1`, `test-renderer@1.2.0`, and `react-native-svg@15.12.1` — it is not a guess. Do not substitute `UNSAFE_getAllByType` or `UNSAFE_root`; RNTL 14 removed both. Do not add per-circle `testID`s — nine test ids is noise on a decorative mark.

- [ ] **Step 5: Type check and lint**

```bash
npx tsc --noEmit && npm run lint
```

Expected: both clean.

- [ ] **Step 6: Commit**

```bash
git add components/GridgoLogo.tsx components/__tests__/GridgoLogo.test.tsx
git commit -m "feat: add the GRIDGO brand lockup

Mark is SVG rather than nine Views so it can be reused for the app icon
and splash screen. GO uses the brand token, not actionYellow: #FFDE58 is
illegible on the light canvas, and brand resolves to #FFDE587 in Light.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Hero illustration

Convert the source scooter SVG into a themed React component. The generator script is written to the scratchpad and run once; only its output is committed.

**Files:**
- Create: `components/illustrations/ScooterIllustration.tsx` (generated)
- Test: `components/__tests__/ScooterIllustration.test.tsx`

**Interfaces:**
- Consumes: `react-native-svg` (Task 1).
- Produces:

```ts
export type IllustrationPalette = {
  ink: string;
  shade: string;
  mid: string;
  tint: string;
  highlight: string;
};

export function ScooterIllustration(props: {
  width: number;
  height: number;
  palette: IllustrationPalette;
}): JSX.Element;
```

**Source:** `/home/kali/Downloads/lukasz_adam_illustrations/lukasz_adam_illustrations/01_illustrations/scooter_illustrations/SVG/Asset 1.svg` — viewBox `0 0 659.89 509.94`, 93 paths, 15 fill classes.

- [ ] **Step 1: Write the generator script**

Create the script in the session scratchpad. Do **not** create it inside the repo — only its output is committed.

```bash
export SCRATCH="/tmp/claude-1000/-home-kali-personal-projects-mobile-gridgo-gridgo-app-gridgo-mobile/6dc9453c-a606-4394-8494-094a9f66513d/scratchpad"
```

If that directory does not exist (a later session has a different id), use any writable path outside the repo and keep it consistent across the next two steps.

Write `$SCRATCH/build-scooter.mjs`:

```js
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SRC =
  "/home/kali/Downloads/lukasz_adam_illustrations/lukasz_adam_illustrations/01_illustrations/scooter_illustrations/SVG/Asset 1.svg";
const OUT = "components/illustrations/ScooterIllustration.tsx";

// Every source fill collapsed onto the five-step GRIDGO ramp, by luminance.
// No class maps to yellow: the screen's yellow budget is spent elsewhere.
const CLASS_MAP = {
  "cls-1": { role: "highlight" },                  // #f8fffb
  "cls-2": { role: "mid" },                        // #048edd  body
  "cls-3": { role: "mid", opacity: 0.5 },          // #048edd @ .5
  "cls-4": { role: "ink" },                        // #000201  outlines
  "cls-5": { role: "highlight" },                  // #fff
  "cls-6": { role: "shade" },                      // #fc691f  was the seat
  "cls-7": { role: "mid" },                        // #fc884f
  "cls-8": { role: "mid" },                        // #6b838c
  "cls-11": { role: "tint" },                      // #d9e1e4
  "cls-12": { role: "shade" },                     // #253b4a
  "cls-13": { role: "shade", opacity: 0.35 },      // #253b4a @ .35
  "cls-14": { role: "shade", opacity: 0.4 },       // #253b4a @ .4
  "cls-15": { role: "tint" },                      // #3ec4ff
  "cls-16": { role: "shade" },                     // #35545b
  "cls-17": { role: "tint" },                      // #a1bcc4
};

// Pale-blue background blobs. Stock-art atmosphere that fights the spartan
// look, and at 40% opacity in this ramp they would be invisible anyway.
// cls-18 is an opacity-only wrapper around them and becomes an empty group.
const DROP = new Set(["cls-9", "cls-10"]);

const svg = readFileSync(SRC, "utf8");

let body = svg
  .replace(/<\?xml[^?]*\?>/, "")
  .replace(/<defs>[\s\S]*?<\/defs>/, "")
  .replace(/<svg[^>]*>/, "")
  .replace(/<\/svg>/, "");

let dropped = 0;
let converted = 0;

body = body.replace(/<path\b([^>]*?)\/?>/g, (match, attrs) => {
  const cls = /class="([^"]+)"/.exec(attrs)?.[1];
  const d = /\sd="([^"]+)"/.exec(attrs)?.[1];

  if (!cls || !d) throw new Error(`Unparsed path: ${match.slice(0, 120)}`);
  if (DROP.has(cls)) {
    dropped += 1;
    return "";
  }

  const spec = CLASS_MAP[cls];
  if (!spec) throw new Error(`Unmapped class: ${cls}`);

  converted += 1;
  const opacity = spec.opacity ? ` opacity={${spec.opacity}}` : "";
  return `<Path d="${d}" fill={palette.${spec.role}}${opacity} />`;
});

// Groups only ever carried opacity classes, which are now on their children.
body = body
  .replace(/<g\b[^>]*>/g, "<G>")
  .replace(/<\/g>/g, "</G>");

// Fail loudly rather than emit a half-converted file.
if (/class=/.test(body)) throw new Error("A class attribute survived conversion");
if (/<path\b/.test(body)) throw new Error("A raw <path> survived conversion");
if (/#[0-9a-fA-F]{3,6}/.test(body)) throw new Error("A source hex survived conversion");

const file = `import Svg, { G, Path } from "react-native-svg";

/**
 * The delivery scooter, recoloured into the GRIDGO ramp.
 *
 * Generated from the source artwork — do not hand-edit. The fifteen source
 * fills collapse onto five tokens by luminance, so the whole illustration
 * inverts between themes rather than being authored twice. The original
 * background blobs are dropped and the orange seat became a grey plane: this
 * screen spends its yellow on the CTA and the active dot, not on scenery.
 */

export type IllustrationPalette = {
  /** Outlines. \`accent\` */
  ink: string;
  /** Dark planes. \`textSecondary\` */
  shade: string;
  /** Mid planes. \`textMuted\` */
  mid: string;
  /** Light planes. \`outline\` */
  tint: string;
  /** Highlights. \`surface\` */
  highlight: string;
};

type Props = {
  width: number;
  height: number;
  palette: IllustrationPalette;
};

export function ScooterIllustration({ width, height, palette }: Props) {
  return (
    <Svg width={width} height={height} viewBox="0 0 659.89 509.94">${body.trimEnd()}
    </Svg>
  );
}
`;

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, file);
console.log(`converted ${converted} paths, dropped ${dropped}`);
```

- [ ] **Step 2: Run the generator**

```bash
node "$SCRATCH/build-scooter.mjs"
```

Expected: `converted 86 paths, dropped 7`. If it throws `Unmapped class`, the source file differs from what the spec recorded — stop and report rather than inventing a mapping.

- [ ] **Step 3: Format and verify the generated file**

```bash
npx prettier --write components/illustrations/ScooterIllustration.tsx
npx tsc --noEmit
grep -o "palette\." components/illustrations/ScooterIllustration.tsx | wc -l
grep -oi "ffde58\|actionYellow" components/illustrations/ScooterIllustration.tsx | wc -l
```

Expected: `tsc` clean, **86** palette references (one per surviving path), and **0** yellow references. Use `grep -o | wc -l` rather than `grep -c` — `grep -c` counts matching lines, and Prettier's wrapping makes that an unreliable proxy for occurrences.

- [ ] **Step 4: Write the test**

Create `components/__tests__/ScooterIllustration.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react-native";
import { processColor } from "react-native";

import { ScooterIllustration } from "@/components/illustrations/ScooterIllustration";

const PALETTE = {
  ink: "#111111",
  shade: "#222222",
  mid: "#333333",
  tint: "#444444",
  highlight: "#555555",
};

/**
 * `react-native-svg` renders host nodes named `RNSVGPath`, and `fill` arrives
 * as a processed colour object rather than the hex string. Compare payloads
 * against `processColor(hex)`.
 */
function fills(): (number | undefined)[] {
  const paths = screen.root?.queryAll((node) => node.type === "RNSVGPath") ?? [];
  return paths.map((path) => path.props.fill?.payload);
}

describe("ScooterIllustration", () => {
  it("draws every path from the supplied palette and nothing else", async () => {
    await render(<ScooterIllustration width={200} height={155} palette={PALETTE} />);

    const allowed = new Set(Object.values(PALETTE).map((hex) => processColor(hex)));
    const strays = fills().filter((f) => !allowed.has(f));

    expect(strays).toEqual([]);
  });

  it("uses all five ramp steps, so the art keeps its tonal separation", async () => {
    await render(<ScooterIllustration width={200} height={155} palette={PALETTE} />);

    expect(new Set(fills()).size).toBe(5);
  });

  it("carries no yellow — the screen spends that budget on the CTA", async () => {
    await render(<ScooterIllustration width={200} height={155} palette={PALETTE} />);

    expect(fills().some((f) => f === processColor("#FFDE58"))).toBe(false);
  });
});
```

- [ ] **Step 5: Run the tests**

Run: `npm test -- ScooterIllustration`
Expected: 3 tests PASS.

- [ ] **Step 6: Lint and commit**

```bash
npm run lint
git add components/illustrations/ScooterIllustration.tsx components/__tests__/ScooterIllustration.test.tsx
git commit -m "feat: add the recoloured scooter hero illustration

Generated from the source artwork. Fifteen source fills collapse onto a
five-step token ramp by luminance, so the illustration inverts between
themes instead of being authored twice. Background blobs dropped; the
orange seat is now a grey plane so the art carries no yellow.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Slide content

**Files:**
- Create: `data/onboarding.ts`
- Test: `data/__tests__/onboarding.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:

```ts
export type OnboardingSlide = {
  id: string;
  step: string;
  title: string;
  body: string;
  cta: string;
};

export const onboardingSlides: readonly OnboardingSlide[];
```

The `01 / 03` step marker earns its place here: Order → Approve → Track is the actual print-job lifecycle, in order, and it mirrors the 4-step request stepper the client meets next. It is also what keeps slide position readable when motion is disabled.

- [ ] **Step 1: Write the failing test**

Create `data/__tests__/onboarding.test.ts`:

```ts
import { onboardingSlides } from "@/data/onboarding";

describe("onboardingSlides", () => {
  it("tells the client journey in three beats", () => {
    expect(onboardingSlides).toHaveLength(3);
  });

  it("numbers each step against the total, so position survives reduced motion", () => {
    expect(onboardingSlides.map((slide) => slide.step)).toEqual([
      "01 / 03",
      "02 / 03",
      "03 / 03",
    ]);
  });

  it("closes on the only slide that starts the product", () => {
    expect(onboardingSlides.at(-1)?.cta).toBe("Get Started");
    expect(onboardingSlides.slice(0, -1).every((s) => s.cta === "Next")).toBe(true);
  });

  it("gives every slide a unique id", () => {
    const ids = onboardingSlides.map((slide) => slide.id);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it("writes every CTA as a verb", () => {
    for (const slide of onboardingSlides) {
      expect(slide.cta).not.toMatch(/submit|continue|ok/i);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- onboarding`
Expected: FAIL with "Cannot find module '@/data/onboarding'".

- [ ] **Step 3: Create `data/onboarding.ts`**

```ts
/**
 * Client onboarding copy.
 *
 * Three beats, in the order a print job actually moves: the request, the
 * proof, the delivery. Riders and suppliers meet their own context after
 * sign-in, through role gating.
 *
 * The copy names things the Davao pilot's clients already recognise — the
 * Messenger back-and-forth it replaces, the preflight check, the stale
 * location warning — rather than describing features.
 */

export type OnboardingSlide = {
  id: string;
  /** Position stated in text, so it survives reduced motion and grayscale. */
  step: string;
  title: string;
  body: string;
  /** A clear verb. Changes on the last slide, which is the one that starts. */
  cta: string;
};

export const onboardingSlides: readonly OnboardingSlide[] = [
  {
    id: "order",
    step: "01 / 03",
    title: "Order print the right way",
    body: "Pick the product, size, material and deadline in four steps. No back-and-forth on Messenger.",
    cta: "Next",
  },
  {
    id: "approve",
    step: "02 / 03",
    title: "Approve before it prints",
    body: "Every file runs a preflight check. You see the proof and approve it, or send it back for changes.",
    cta: "Next",
  },
  {
    id: "track",
    step: "03 / 03",
    title: "Watch it come to you",
    body: "Track your rider on the map with a live ETA, and an honest note when the location goes stale.",
    cta: "Get Started",
  },
] as const;
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- onboarding`
Expected: 5 tests PASS.

- [ ] **Step 5: Type check, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add data/onboarding.ts data/__tests__/onboarding.test.ts
git commit -m "feat: add onboarding slide content

Three beats in the order a print job moves. Copy names what clients
recognise — the Messenger thread it replaces, the preflight check, the
stale location warning — rather than listing features.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Pagination dots

**Files:**
- Create: `components/PaginationDots.tsx`
- Test: `components/__tests__/PaginationDots.test.tsx`

**Interfaces:**
- Consumes: `react-native-reanimated`, `useThemeColors`.
- Produces:

```ts
export function PaginationDots(props: {
  count: number;
  activeIndex: number;
  scrollX: SharedValue<number>;
  width: number;
  onPress: (index: number) => void;
}): JSX.Element;
```

`activeIndex` and `scrollX` are deliberately both present. `scrollX` drives the width and colour so the dots track the gesture continuously; `activeIndex` drives only `accessibilityState.selected`, which cannot read a shared value.

- [ ] **Step 1: Write the failing test**

Create `components/__tests__/PaginationDots.test.tsx`:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { makeMutable } from "react-native-reanimated";

import { PaginationDots } from "@/components/PaginationDots";

async function setup(activeIndex = 0, onPress = jest.fn()) {
  const scrollX = makeMutable(activeIndex * 300);
  await render(
    <PaginationDots
      count={3}
      activeIndex={activeIndex}
      scrollX={scrollX}
      width={300}
      onPress={onPress}
    />,
  );
  return { onPress };
}

describe("PaginationDots", () => {
  it("exposes one tab per slide", async () => {
    await setup();

    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("names each tab by position, not by colour", async () => {
    await setup();

    expect(screen.getByLabelText("Slide 1 of 3")).toBeTruthy();
    expect(screen.getByLabelText("Slide 3 of 3")).toBeTruthy();
  });

  it("marks only the active tab as selected", async () => {
    await setup(1);

    const selected = screen
      .getAllByRole("tab")
      .filter((tab) => tab.props.accessibilityState?.selected);

    expect(selected).toHaveLength(1);
    expect(selected[0].props.accessibilityLabel).toBe("Slide 2 of 3");
  });

  it("reports the tapped index", async () => {
    const { onPress } = await setup();

    fireEvent.press(screen.getByLabelText("Slide 3 of 3"));

    expect(onPress).toHaveBeenCalledWith(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- PaginationDots`
Expected: FAIL with "Cannot find module '@/components/PaginationDots'".

- [ ] **Step 3: Create `components/PaginationDots.tsx`**

```tsx
import { Pressable, View } from "react-native";
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  type SharedValue,
} from "react-native-reanimated";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * Slide position, in the same visual language as the GRIDGO mark: quiet dots
 * with one lit. The active dot stretches into a pill rather than only
 * changing colour, so position reads in grayscale too.
 *
 * The dots are an "active step" indicator, which is one of the few places
 * the system allows actionYellow outside a primary CTA.
 */

const DOT = 8;
const ACTIVE = 24;
/** 8px dot + 18px above and below clears the 44px minimum. */
const PAD = 18;

type Props = {
  count: number;
  /** Drives accessibility only. Animation reads `scrollX`. */
  activeIndex: number;
  /** Horizontal scroll offset in px. */
  scrollX: SharedValue<number>;
  /** Page width in px, so the offset can be read as a fractional page. */
  width: number;
  onPress: (index: number) => void;
};

export function PaginationDots({ count, activeIndex, scrollX, width, onPress }: Props) {
  return (
    <View className="flex-row items-center gap-2" accessibilityRole="tablist">
      {Array.from({ length: count }, (_, index) => (
        <Dot
          key={index}
          index={index}
          count={count}
          selected={index === activeIndex}
          scrollX={scrollX}
          width={width}
          onPress={onPress}
        />
      ))}
    </View>
  );
}

type DotProps = {
  index: number;
  count: number;
  selected: boolean;
  scrollX: SharedValue<number>;
  width: number;
  onPress: (index: number) => void;
};

function Dot({ index, count, selected, scrollX, width, onPress }: DotProps) {
  const colors = useThemeColors();
  const reducedMotion = useReducedMotion();

  // Animated values cannot come from a class, so this is on the style
  // exception list.
  const style = useAnimatedStyle(() => {
    const page = width > 0 ? scrollX.value / width : 0;
    // 1 when this dot's page is centred, falling to 0 at its neighbours.
    // With reduced motion it snaps instead of easing.
    const weight = reducedMotion
      ? Math.round(page) === index
        ? 1
        : 0
      : Math.max(0, 1 - Math.abs(page - index));

    return {
      width: DOT + (ACTIVE - DOT) * weight,
      backgroundColor: interpolateColor(
        weight,
        [0, 1],
        [colors.outline, colors.actionYellow],
      ),
    };
  });

  return (
    <Pressable
      onPress={() => onPress(index)}
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      accessibilityLabel={`Slide ${index + 1} of ${count}`}
      style={{ paddingVertical: PAD }}
    >
      <Animated.View style={[{ height: DOT, borderRadius: DOT / 2 }, style]} />
    </Pressable>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- PaginationDots`
Expected: 4 tests PASS.

- [ ] **Step 5: Type check, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add components/PaginationDots.tsx components/__tests__/PaginationDots.test.tsx
git commit -m "feat: add pagination dots

The active dot stretches into a pill as well as changing colour, so
position reads in grayscale. scrollX drives the animation so the dots
track the gesture; activeIndex drives only the accessibility state,
which cannot read a shared value.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: The onboarding screen

**Files:**
- Create: `app/onboarding.tsx`
- Test: `__tests__/onboarding-screen.test.tsx` (repo root — see File Structure for why it is not under `app/`)

**Interfaces:**
- Consumes: `GridgoLogo` (Task 2), `ScooterIllustration` + `IllustrationPalette` (Task 3), `onboardingSlides` (Task 4), `PaginationDots` (Task 5), existing `PrimaryButton`.
- Produces: a default-exported route component.

**Aspect ratio:** the illustration viewBox is 659.89 × 509.94, so height = width / 1.2941.

`app.json` sets `reactCompiler: true`, so do not add `useMemo`/`useCallback` — the compiler handles memoisation.

- [ ] **Step 1: Write the failing test**

Create `__tests__/onboarding-screen.test.tsx` at the repo root:

```tsx
import { fireEvent, render, screen } from "@testing-library/react-native";
import { router } from "expo-router";

import OnboardingScreen from "@/app/onboarding";
import { onboardingSlides } from "@/data/onboarding";

jest.mock("expo-router", () => ({
  router: { back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

describe("OnboardingScreen", () => {
  beforeEach(() => jest.clearAllMocks());

  it("opens on the first beat of the journey", async () => {
    await render(<OnboardingScreen />);

    expect(screen.getByText(onboardingSlides[0].title)).toBeTruthy();
    expect(screen.getByText(onboardingSlides[0].step)).toBeTruthy();
  });

  it("renders every slide so the pager has something to scroll", async () => {
    await render(<OnboardingScreen />);

    for (const slide of onboardingSlides) {
      expect(screen.getByText(slide.title)).toBeTruthy();
    }
  });

  it("gives one tab per slide", async () => {
    await render(<OnboardingScreen />);

    expect(screen.getAllByRole("tab")).toHaveLength(onboardingSlides.length);
  });

  it("starts with the advancing CTA, not the finishing one", async () => {
    await render(<OnboardingScreen />);

    expect(screen.getByText("Next")).toBeTruthy();
    expect(screen.queryByText("Get Started")).toBeNull();
  });

  it("lets someone leave without finishing", async () => {
    await render(<OnboardingScreen />);

    fireEvent.press(screen.getByText("Skip"));

    expect(router.back).toHaveBeenCalled();
  });

  it("marks the slide title as a heading", async () => {
    await render(<OnboardingScreen />);

    expect(screen.getByRole("header", { name: onboardingSlides[0].title })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- onboarding-screen`
Expected: FAIL with "Cannot find module '@/app/onboarding'".

- [ ] **Step 3: Create `app/onboarding.tsx`**

```tsx
import { router } from "expo-router";
import { useState } from "react";
import {
  Pressable,
  Text,
  useWindowDimensions,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";
import { SafeAreaView } from "react-native-safe-area-context";

import { GridgoLogo } from "@/components/GridgoLogo";
import { PaginationDots } from "@/components/PaginationDots";
import { PrimaryButton } from "@/components/PrimaryButton";
import { ScooterIllustration } from "@/components/illustrations/ScooterIllustration";
import { onboardingSlides } from "@/data/onboarding";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Client onboarding.
 *
 * Three regions moving at three rates: a fixed illustration that drifts at
 * half speed, a pager carrying only the text, and a fixed footer. The
 * illustration is one layer rather than one copy per page, which is what
 * makes the parallax possible.
 *
 * Reachable from the design-system route today. The once-only gate lands
 * with the session store, so nothing here persists.
 */

/** Source viewBox is 659.89 x 509.94. */
const ASPECT = 659.89 / 509.94;
const HERO_MAX = 360;

export default function OnboardingScreen() {
  const colors = useThemeColors();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollX = useSharedValue(0);
  const [index, setIndex] = useState(0);

  const heroWidth = Math.min(width - 32, HERO_MAX);
  const last = onboardingSlides.length - 1;

  const palette = {
    ink: colors.accent,
    shade: colors.textSecondary,
    mid: colors.textMuted,
    tint: colors.outline,
    highlight: colors.surface,
  };

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollX.value = event.contentOffset.x;
  });

  // The CTA label is React state, so it cannot read the shared value. Settle
  // it once per page rather than on every frame.
  function onMomentumScrollEnd(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setIndex(Math.round(event.nativeEvent.contentOffset.x / width));
  }

  function goTo(next: number) {
    scrollRef.current?.scrollTo({ x: next * width, animated: !reducedMotion });
    setIndex(next);
  }

  function dismiss() {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  }

  const heroStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: reducedMotion ? 0 : -scrollX.value * 0.5 }],
  }));

  return (
    <SafeAreaView
      style={{ flex: 1, backgroundColor: colors.canvas }}
      edges={["top", "bottom"]}
    >
      <View className="gg-page flex-row items-center justify-between py-3">
        <GridgoLogo />
        <Pressable
          onPress={dismiss}
          accessibilityRole="button"
          className="gg-touch items-end justify-center"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
        >
          <Text className="text-button text-text-secondary">Skip</Text>
        </Pressable>
      </View>

      <View className="flex-1 items-center justify-center overflow-hidden">
        <Animated.View style={heroStyle}>
          <ScooterIllustration
            width={heroWidth}
            height={heroWidth / ASPECT}
            palette={palette}
          />
        </Animated.View>
      </View>

      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={onMomentumScrollEnd}
        scrollEventThrottle={16}
        style={{ flexGrow: 0 }}
      >
        {onboardingSlides.map((slide, slideIndex) => (
          <Slide
            key={slide.id}
            index={slideIndex}
            step={slide.step}
            title={slide.title}
            body={slide.body}
            scrollX={scrollX}
            width={width}
          />
        ))}
      </Animated.ScrollView>

      <View className="gg-page gap-4 pb-2 pt-5">
        <PaginationDots
          count={onboardingSlides.length}
          activeIndex={index}
          scrollX={scrollX}
          width={width}
          onPress={goTo}
        />
        <PrimaryButton
          label={onboardingSlides[index].cta}
          onPress={() => (index === last ? dismiss() : goTo(index + 1))}
        />
      </View>
    </SafeAreaView>
  );
}

type SlideProps = {
  index: number;
  step: string;
  title: string;
  body: string;
  scrollX: SharedValue<number>;
  width: number;
};

/**
 * One text page. The hairline and the step number are the job-ticket
 * language the design-system route already uses, and the number is what
 * states position when motion is off.
 */
function Slide({ index, step, title, body, scrollX, width }: SlideProps) {
  const reducedMotion = useReducedMotion();

  const style = useAnimatedStyle(() => {
    if (reducedMotion) return { opacity: 1 };
    const page = width > 0 ? scrollX.value / width : 0;
    return { opacity: Math.max(0, 1 - Math.abs(page - index)) };
  });

  return (
    <Animated.View style={[{ width }, style]}>
      <View className="gg-page gap-2">
        <View className="gg-divider" />
        <Text className="pt-2 text-overline text-text-muted">{step}</Text>
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-body-lg text-text-secondary">{body}</Text>
      </View>
    </Animated.View>
  );
}
```

- [ ] **Step 4: Run the tests**

Run: `npm test -- onboarding-screen`
Expected: 6 tests PASS.

If `getByRole("header", { name })` is unsupported by the installed RNTL version, replace that assertion with:

```tsx
expect(screen.getByText(onboardingSlides[0].title).props.accessibilityRole).toBe("header");
```

- [ ] **Step 5: Type check, lint, commit**

```bash
npx tsc --noEmit && npm run lint
git add app/onboarding.tsx __tests__/onboarding-screen.test.tsx
git commit -m "feat: add the onboarding screen

Three regions at three rates: a single illustration layer drifting at
half speed, a pager carrying only text, a fixed footer. scrollX drives
animation on the UI thread; a settled index state drives the CTA label
and accessibility, which cannot read a shared value.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Route registration, home link, and full verification

**Files:**
- Modify: `app/_layout.tsx` (the `Stack` children)
- Modify: `app/index.tsx` (imports, and the masthead below `ThemeSwitch`)

**Interfaces:**
- Consumes: `app/onboarding.tsx` (Task 6).
- Produces: `/onboarding` reachable from `/`.

- [ ] **Step 1: Register the route in `app/_layout.tsx`**

Add a second `Stack.Screen` beside the existing one:

```tsx
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
```

- [ ] **Step 2: Add the link in `app/index.tsx`**

Add to the existing imports:

```tsx
import { router } from "expo-router";
```

Then, inside the masthead `View`, directly after `<ThemeSwitch />`:

```tsx
            {/* Scaffolding: onboarding has no once-only gate yet, so it needs
                a door while the session store is still outstanding. */}
            <View className="pt-3">
              <SecondaryButton
                label="View onboarding"
                onPress={() => router.push("/onboarding")}
              />
            </View>
```

`SecondaryButton` is already imported in this file. It stays monochrome, so the page's single yellow remains on "Approve & Continue".

- [ ] **Step 3: Run the full suite**

```bash
npm test
npx tsc --noEmit
npm run lint
```

Expected: all suites PASS, `tsc` clean, lint clean.

- [ ] **Step 4: Verify on device**

```bash
npx expo start
```

Work through every check and note the result:

1. Tap **View onboarding** on the home route. The screen opens with no header.
2. Swipe all three slides forward, then back. The scooter drifts at roughly half the text's speed and tracks the gesture, not just the settle.
3. Text fades down as its page leaves centre and back up as the next arrives.
4. Tap each dot. The pager animates to that slide, the dot stretches into a yellow pill, the others stay grey.
5. CTA reads **Next** on slides 1 and 2, **Get Started** on slide 3.
6. **Get Started** and **Skip** both return to the home route.
7. Set the theme to Light on the home route, then reopen onboarding: the six structural mark dots are black, the corner dot is yellow, `GO` is the deeper `#FFDE587` gold, and the scooter shows five distinguishable tones.
8. Set the theme to Dark and repeat: the mark's structural dots are near-white, `GO` is `#FFDE58`, and the scooter reads as light line art that stays clear of the black canvas.
9. Enable Reduce Motion at the OS level and reopen. Paging and dot taps still work; nothing eases.
10. Screenshot both themes and desaturate them. Slide position must still be readable from `01 / 03` and from the active dot's width.

- [ ] **Step 5: Count the yellow**

On each slide, confirm yellow appears in exactly four places: the mark's corner dot, the `GO`, the active pagination dot, and the CTA. Anything else is a bug — most likely a stray fill in the generated illustration.

- [ ] **Step 6: Commit**

```bash
git add app/_layout.tsx app/index.tsx
git commit -m "feat: link onboarding from the home route

Registers /onboarding headerless and gives it a door from the design
system page. The link is a SecondaryButton so that page keeps its single
yellow on Approve & Continue.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

## Deferred (do not build)

Listed so nobody adds them opportunistically:

- Once-only gating (`hasSeenOnboarding`). Waits for the Zustand session store so it is not written twice.
- Role selection. Clerk owns role; a pre-auth picker would duplicate auth state.
- Removing `@expo/vector-icons` from `package.json`. React Navigation may resolve it internally.
- Rider and supplier onboarding. Role gating delivers those after sign-in.
