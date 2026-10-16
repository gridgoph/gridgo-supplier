import { View } from "react-native";

type Props = {
  /** Basis points of the whole sheet, 0–10,000. */
  bps: number;
  size?: "sm" | "md";
};

const SIZES = {
  sm: { width: 18, height: 24 },
  md: { width: 24, height: 32 },
} as const;

/**
 * A sheet filled to its strong-colour coverage, from the foot up. Square
 * corners, because it is a sheet of paper, not a control.
 *
 * Monochrome on purpose: coverage is a quantity, not a status, and the label
 * beside it says the same thing in words, so it reads in greyscale. A sheet
 * with no strong colour is empty with one hairline at its foot, so zero never
 * looks like a missing picture. Decorative, hidden from screen readers.
 */
export function CoverageGlyph({ bps, size = "md" }: Props) {
  const { width, height } = SIZES[size];
  const inner = height - 6;
  const share = Math.max(0, Math.min(10_000, bps)) / 10_000;
  // A sliver of real colour still shows: never thinner than one point.
  const fill = share === 0 ? 0 : Math.max(1, Math.round(inner * share));

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      className="justify-end border-2 border-text-primary bg-surface p-0.5"
      style={{ width, height }}
    >
      {fill > 0 ? (
        <View className="bg-text-primary" style={{ height: fill, opacity: 0.85 }} />
      ) : (
        <View className="mx-0.5 h-px bg-text-muted" />
      )}
    </View>
  );
}
