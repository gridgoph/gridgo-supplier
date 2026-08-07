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
