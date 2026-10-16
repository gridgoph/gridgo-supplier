import { Text, View } from "react-native";
import Svg, { Line } from "react-native-svg";

import { useThemeColors } from "@/hooks/useTheme";
import { swatchKind, type ColorTarget } from "@/lib/colorTargets";

const STRIP: Record<string, string> = { pantone: "PMS", cmyk: "CMYK", hex: "HEX" };

/**
 * One exact colour as a fan-deck chip: the colour on top, the format under
 * it, the way a printer's swatch book is laid out — the same chip the client
 * saw when they named it. An approximate swatch says so in the strip (≈); a
 * Pantone with no swatch is an empty chip struck through, because GRIDGO has
 * no Pantone colours to paint it with. The row beside it says the same in
 * words, so the chip never carries it alone.
 */
export function ColorChip({ target }: { target: Pick<ColorTarget, "format" | "swatchHex" | "swatchApproximate"> }) {
  const colors = useThemeColors();
  const kind = swatchKind(target);
  const strip = STRIP[target.format] ?? "";
  return (
    <View
      aria-hidden
      className="overflow-hidden border border-outline bg-surface"
      // A swatch-book chip, not a card: its own small radius and fixed size are runtime geometry.
      style={{ width: 56, height: 64, borderRadius: 6 }}
    >
      <View
        className="items-center justify-center border-b border-outline-subtle"
        style={{ height: 44, backgroundColor: kind === "none" ? colors.surfaceVariant : target.swatchHex ?? undefined }}
      >
        {kind === "none" ? (
          <Svg width={56} height={44} viewBox="0 0 56 44">
            <Line x1={4} y1={40} x2={52} y2={4} stroke={colors.textMuted} strokeWidth={1.25} />
          </Svg>
        ) : null}
      </View>
      <View className="flex-1 items-center justify-center">
        <Text className="text-caption font-medium text-text-secondary" numberOfLines={1}>
          {kind === "approximate" ? `≈ ${strip}` : strip}
        </Text>
      </View>
    </View>
  );
}

/** A colour GRIDGO read from a file: a dot of it, or a ring where the file stated no value. */
export function ColorDot({ hex, size = 16 }: { hex: string | null; size?: number }) {
  return (
    <View
      aria-hidden
      className="rounded-pill border border-outline"
      style={{ width: size, height: size, backgroundColor: hex ?? "transparent" }}
    />
  );
}
