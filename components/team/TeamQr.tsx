import { useMemo } from "react";
import { View } from "react-native";
import Svg, { Path, Rect } from "react-native-svg";

import { colors } from "@/constants/theme";
import { qrPath } from "@/lib/qrMatrix";

type Props = {
  value: string;
  /** Edge in px, quiet zone included. */
  size?: number;
};

/** Modules of white around the code, as the QR standard asks. */
const QUIET = 4;

/**
 * A join link as a QR code, for the new teammate to scan off the Owner's phone.
 *
 * Always dark on white, in both themes: a scanner reads contrast, not tokens,
 * and an inverted code is one many phone cameras refuse.
 */
export function TeamQr({ value, size = 232 }: Props) {
  const { size: modules, path } = useMemo(() => qrPath(value), [value]);
  const box = modules + QUIET * 2;

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel="QR code to join your shop's team"
      style={{ width: size, height: size }}
    >
      <Svg width={size} height={size} viewBox={`0 0 ${box} ${box}`}>
        <Rect x={0} y={0} width={box} height={box} fill={colors.light.surface} />
        <Path d={path} fill={colors.light.textPrimary} transform={`translate(${QUIET} ${QUIET})`} />
      </Svg>
    </View>
  );
}
