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

/** `text-h3` line-height — keeps the mark on the wordmark line when a role hangs below. */
const WORDMARK_LINE_HEIGHT = 26;

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

/** Plain-type role labels under the wordmark. Rider uses a pill instead. */
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

type Props = {
  /** Rendered edge length in px. The grid scales with it. */
  size?: number;
  /**
   * Optional product role lockup. Omit or pass `client` for the bare
   * wordmark (individual client). Other roles render a subordinate label
   * under the wordmark, left-aligned with it.
   */
  role?: GridgoLogoRole;
};

export function GridgoMark({ size = 28 }: Pick<Props, "size">) {
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
 * Mark plus wordmark, optionally with a product role lockup.
 *
 * `GO` uses `brand`, not `actionYellow`. `#FFDE58` on the light canvas is
 * illegible, and `brand` resolves to `#D4A017` in Light and `#FFDE58` in
 * Dark — yellow in both themes, without spending the screen's one CTA colour.
 *
 * Role layout (from the family reference): mark left, wordmark right, role
 * label below the wordmark and left-aligned with it — not beside the mark,
 * not centred under the whole lockup. Rider is the one exception: uppercase
 * `RIDER` in a filled yellow pill with dark text.
 */
export function GridgoLogo({ size = 28, role }: Props) {
  const plainLabel =
    role && role !== "client" && role !== "rider"
      ? ROLE_PLAIN_LABEL[role]
      : null;
  const showRiderPill = role === "rider";
  const hasRoleLockup = plainLabel !== null || showRiderPill;
  // Nudge a short mark down onto the wordmark midline; never clip a tall one.
  const markTop = Math.max(0, (WORDMARK_LINE_HEIGHT - size) / 2);

  return (
    <View
      className="flex-row items-start gap-2"
      // Collapses the mark, wordmark, and role into one node, so a screen
      // reader says "GRIDGO Supplier" once rather than spelling out the pieces.
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabelFor(role)}
    >
      <View style={{ marginTop: markTop }}>
        <GridgoMark size={size} />
      </View>
      <View className="min-w-0 shrink">
        <Text className="font-brand text-h3 text-text-primary">
          GRID<Text className="text-brand">GO</Text>
        </Text>
        {hasRoleLockup ? (
          showRiderPill ? (
            // Presentational only — the outer View owns the accessible label.
            <View className="mt-0.5 self-start rounded-full bg-action-yellow px-2 py-0.5">
              <Text className="font-bold text-caption text-action-yellow-on">
                RIDER
              </Text>
            </View>
          ) : (
            <Text className="mt-0.5 text-body text-text-muted">{plainLabel}</Text>
          )
        ) : null}
      </View>
    </View>
  );
}
