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

/**
 * Product roles in the GRIDGO family. Typed so a typo cannot ship a wrong
 * lockup label. `client` is the individual account — wordmark only, no label.
 */
export const GRIDGO_LOGO_ROLES = [
  "client",
  "business",
  "supplier",
  "rider",
  "admin",
] as const;

export type GridgoLogoRole = (typeof GRIDGO_LOGO_ROLES)[number];

/** Plain-type role labels beside the mark. Rider uses a pill instead. */
const ROLE_PLAIN_LABEL: Record<Exclude<GridgoLogoRole, "client" | "rider">, string> =
  {
    business: "Business",
    supplier: "Supplier",
    admin: "Admin",
  };

function accessibilityLabelFor(role: GridgoLogoRole | undefined): string {
  switch (role) {
    case "business":
      return "GRIDGO Business";
    case "supplier":
      return "GRIDGO Supplier";
    case "rider":
      return "GRIDGO Rider";
    case "admin":
      return "GRIDGO Admin";
    default:
      return "GRIDGO";
  }
}

/* ----------------------------------------------------------------------------
   Lockup proportions
   ----------------------------------------------------------------------------
   Read off the family reference, expressed as fractions of `size` so the
   lockup scales as one drawing instead of three independently-tuned numbers.

   In the reference the mark measures 70 x 73 px against a 40 px wordmark and
   a 30 px role word; the mark's top edge lands on the cap line of GRIDGO and
   its bottom edge on the descender line under the role word. Everything below
   is that measurement divided by the mark's edge length.
   -------------------------------------------------------------------------- */

/** Two-line lockup: 40/73. The mark is ~1.8x the wordmark it stands beside. */
const WORDMARK_OF_SIZE_LOCKUP = 0.55;
/** One-line lockup: the classic 1.6x, which is what this app shipped before. */
const WORDMARK_OF_SIZE_SOLO = 0.62;
/**
 * Role word against the wordmark, as a ratio of type sizes.
 *
 * What the reference actually fixes is the ratio of the *drawn* letters: its
 * role caps measure 21px against GRIDGO's 28px, so 0.75 in ink. Satoshi's cuts
 * do not share a cap height — Black draws caps at 0.740em, Medium at 0.723em —
 * so type sizes have to run slightly wider apart than the ink does to land
 * there: 0.80 x 0.740 / 0.723 renders caps at 0.78, which is the reference.
 *
 * Do not "simplify" this to the ink ratio. Deriving it from the caps is what
 * keeps the lockup right when Poppins ExtraBold replaces the Satoshi stand-in.
 */
const ROLE_OF_WORDMARK = 0.8;
/** Nothing essential goes below 12px, and the role word names the product. */
const ROLE_MIN_SIZE = 12;
/** The wordmark's share of the two-line block; the role line takes the rest. */
const WORDMARK_LINE_SHARE = 0.53;
/** Mark-to-text gap: 18/73. */
const GAP_OF_SIZE = 0.25;

export type GridgoLockupMetrics = {
  /** Edge length of the square mark — also the height of the whole lockup. */
  markSize: number;
  wordmarkSize: number;
  wordmarkLineHeight: number;
  roleSize: number;
  /** 0 when there is no role line. */
  roleLineHeight: number;
  gap: number;
};

/**
 * The one place the lockup's geometry is decided.
 *
 * The invariant this exists to protect: `markSize` equals the height of the
 * text block beside it — both lines when there is a role, the single wordmark
 * line when there is not. A mark shorter than its text block is the bug this
 * lockup has regressed into twice.
 */
export function gridgoLockupMetrics(
  size: number,
  hasRole: boolean,
): GridgoLockupMetrics {
  const wordmarkSize = Math.round(
    size * (hasRole ? WORDMARK_OF_SIZE_LOCKUP : WORDMARK_OF_SIZE_SOLO),
  );
  // Split the block so the two line boxes add back up to `size` exactly; the
  // mark can then span it without a rounding seam at the bottom edge.
  const wordmarkLineHeight = hasRole
    ? Math.round(size * WORDMARK_LINE_SHARE)
    : size;

  return {
    markSize: size,
    wordmarkSize,
    wordmarkLineHeight,
    roleSize: Math.max(
      ROLE_MIN_SIZE,
      Math.round(wordmarkSize * ROLE_OF_WORDMARK),
    ),
    roleLineHeight: hasRole ? size - wordmarkLineHeight : 0,
    gap: Math.round(size * GAP_OF_SIZE),
  };
}

export function GridgoMark({ size = 40 }: Pick<Props, "size">) {
  const colors = useThemeColors();

  return (
    <Svg
      testID="gridgo-mark"
      width={size}
      height={size}
      viewBox="0 0 100 100"
    >
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

type Props = {
  /**
   * Height of the whole lockup in px, which is the mark's edge length: the
   * mark is square and spans the full text block beside it. With a role that
   * block is two lines, so `size` covers GRIDGO plus the role word; without
   * one it is a single line and `size` covers the wordmark alone. The type
   * scales off it, so a call site picks this one number and nothing else.
   */
  size?: number;
  /**
   * Optional product role lockup. Omit or pass `client` for the bare
   * wordmark (individual client). Other roles render a subordinate label
   * on a second line, left-aligned under the wordmark.
   */
  role?: GridgoLogoRole;
};

/**
 * Mark plus wordmark, optionally with a product role lockup.
 *
 * `GO` uses `brand`, not `actionYellow`. `#FFDE58` on the light canvas is
 * illegible, and `brand` resolves to `#D4A017` in Light and `#FFDE58` in
 * Dark — yellow in both themes, without spending the screen's one CTA colour.
 *
 * Layout (from the family reference): the mark stands on the left at the full
 * height of the text block, and the wordmark and role word stack in a column
 * to its right — not the mark beside one line with the role hung underneath
 * the pair. Rider is the one exception to the role word: uppercase `RIDER` in
 * a filled yellow pill with dark text, occupying the same second line.
 *
 *   +--------+  GRIDGO
 *   |  mark  |  Supplier
 *   +--------+
 */
export function GridgoLogo({ size = 40, role }: Props) {
  const plainLabel =
    role && role !== "client" && role !== "rider"
      ? ROLE_PLAIN_LABEL[role]
      : null;
  const showRiderPill = role === "rider";
  const hasRole = plainLabel !== null || showRiderPill;
  const metrics = gridgoLockupMetrics(size, hasRole);

  return (
    <View
      className="flex-row items-center"
      style={{ columnGap: metrics.gap }}
      // Collapses the mark, wordmark, and role into one node, so a screen
      // reader says "GRIDGO Supplier" once rather than spelling out the pieces.
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabelFor(role)}
    >
      <GridgoMark size={metrics.markSize} />
      <View className="min-w-0 shrink">
        <Text
          className="font-brand text-text-primary"
          style={{
            fontSize: metrics.wordmarkSize,
            lineHeight: metrics.wordmarkLineHeight,
            // Tight leading is what makes the mark span the block; without
            // this Android reserves font padding and the edges drift.
            includeFontPadding: false,
          }}
          allowFontScaling={false}
        >
          GRID<Text className="text-brand">GO</Text>
        </Text>
        {hasRole ? (
          showRiderPill ? (
            // Presentational only — the outer View owns the accessible label.
            <View
              className="items-center justify-center"
              style={{ height: metrics.roleLineHeight }}
            >
              <View
                className="self-start rounded-pill bg-action-yellow"
                style={{
                  paddingHorizontal: Math.round(metrics.roleSize * 0.5),
                  paddingVertical: Math.round(metrics.roleSize * 0.15),
                }}
              >
                <Text
                  className="font-bold text-action-yellow-on"
                  style={{
                    fontSize: Math.round(metrics.roleSize * 0.7),
                    lineHeight: Math.round(metrics.roleSize * 0.9),
                  }}
                  allowFontScaling={false}
                >
                  RIDER
                </Text>
              </View>
            </View>
          ) : (
            <Text
              // `text-secondary`, not `text-muted`: the role word is part of
              // the identity, not metadata about it.
              className="font-medium text-text-secondary"
              style={{
                fontSize: metrics.roleSize,
                lineHeight: metrics.roleLineHeight,
                includeFontPadding: false,
              }}
              allowFontScaling={false}
            >
              {plainLabel}
            </Text>
          )
        ) : null}
      </View>
    </View>
  );
}
