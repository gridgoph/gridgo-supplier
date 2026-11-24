import { Text, View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { Delete } from "lucide-react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  onDigit: (digit: string) => void;
  onDelete: () => void;
  disabled?: boolean;
};

const ROWS = [
  ["1", "2", "3"],
  ["4", "5", "6"],
  ["7", "8", "9"],
  ["", "0", "del"],
] as const;

/**
 * A counter number pad: big keys a thumb finds without looking, always in the
 * same place, so typing a client's code never waits on the phone's keyboard
 * sliding up over the boxes (gridgo-supplier#269).
 */
export function NumberPad({ onDigit, onDelete, disabled = false }: Props) {
  const colors = useThemeColors();
  return (
    <View className="gap-2" testID="number-pad">
      {ROWS.map((row, rowIndex) => (
        <View key={rowIndex} className="flex-row gap-2">
          {row.map((key, index) =>
            key === "" ? (
              <View key={`blank-${index}`} className="h-14 flex-1" />
            ) : (
              <Pressable
                key={key}
                onPress={() => (key === "del" ? onDelete() : onDigit(key))}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={key === "del" ? "Delete" : key}
                accessibilityState={{ disabled }}
                testID={`number-pad-${key}`}
                className={
                  disabled
                    ? "gg-disabled h-14 flex-1 items-center justify-center rounded-field border border-outline bg-surface"
                    : "h-14 flex-1 items-center justify-center rounded-field border border-outline bg-surface"
                }
                style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
              >
                {key === "del" ? (
                  <Delete size={24} color={colors.textPrimary} strokeWidth={2} />
                ) : (
                  <Text className="text-h2 text-text-primary">{key}</Text>
                )}
              </Pressable>
            ),
          )}
        </View>
      ))}
    </View>
  );
}
