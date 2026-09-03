import { Text, View } from "react-native";

import { Stepper } from "@/components/controls/Stepper";
import { PRINTER_MAX_WIDTH_FEET } from "@/lib/listings";

type Props = {
  value: number | null;
  onChange: (value: number | null) => void;
};

/**
 * Max printer width, in feet.
 *
 * Only tarpaulin listings draw this. A shop with 5 ft printers cannot take a
 * 7 ft job, so the number has to be said before the listing can go up.
 */
export function PrinterCapField({ value, onChange }: Props) {
  return (
    <View className="gap-2">
      <Text className="text-caption text-text-muted">Max printer width</Text>
      <Stepper
        value={value ?? 0}
        onChange={(next) => onChange(next > 0 ? next : null)}
        min={0}
        max={PRINTER_MAX_WIDTH_FEET.max}
        step={1}
        unit="feet"
        accessibilityLabel="Max printer width in feet"
      />
      <Text className="text-caption text-text-muted">
        The widest your machine can print. Some shops run 5 ft printers; others run 7 ft.
      </Text>
    </View>
  );
}
