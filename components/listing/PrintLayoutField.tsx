import { Square, SquareCheck } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { PrintLayoutDiagram } from "@/components/PrintLayoutDiagram";
import { useThemeColors } from "@/hooks/useTheme";
import {
  PRINT_LAYOUT_CODES,
  PRINT_LAYOUT_LABEL,
  PRINT_LAYOUT_MEANING,
  SAMPLE_PAGE,
  SAMPLE_PAPER,
  togglePrintLayout,
  type PrintLayoutCode,
} from "@/lib/printLayout";

type Props = {
  value: readonly PrintLayoutCode[];
  onChange: (next: PrintLayoutCode[]) => void;
  /** From `printLayoutsNote`: what marking does to clients, and whether it waits on review. */
  note: string[];
  disabled?: boolean;
};

/**
 * Which layouts a listing prints (gridgo-api `docs/PRINT_LAYOUT_API.md`).
 *
 * Each layout is a row with a small picture of it, because the three names
 * differ by a word and the picture is what tells them apart: the same oversized
 * page, fitted, centred, and pinned to the corner. Any number may be marked.
 */
export function PrintLayoutField({ value, onChange, note, disabled }: Props) {
  const colors = useThemeColors();

  return (
    <View className="gap-3">
      <View className="gap-2" accessibilityRole="list" accessibilityLabel="Print layouts this listing offers">
        {PRINT_LAYOUT_CODES.map((code) => {
          const on = value.includes(code);
          return (
            <Pressable
              key={code}
              onPress={() => onChange(togglePrintLayout(value, code))}
              disabled={disabled}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on, disabled: Boolean(disabled) }}
              accessibilityLabel={PRINT_LAYOUT_LABEL[code]}
              accessibilityHint={PRINT_LAYOUT_MEANING[code]}
              className={
                on
                  ? "gg-touch flex-row items-center gap-3 rounded-field border border-accent bg-surface px-3 py-3"
                  : "gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
              }
              style={({ pressed }) => (pressed && !disabled ? { opacity: 0.7 } : undefined)}
            >
              <PrintLayoutDiagram layout={code} paper={SAMPLE_PAPER} page={SAMPLE_PAGE} width={44} height={52} />
              <View className="min-w-0 flex-1">
                <Text
                  className={on ? "text-body font-medium text-text-primary" : "text-body text-text-secondary"}
                >
                  {PRINT_LAYOUT_LABEL[code]}
                </Text>
                <Text className="mt-0.5 text-caption text-text-muted">{PRINT_LAYOUT_MEANING[code]}</Text>
              </View>
              {on ? (
                <SquareCheck size={22} color={colors.accent} strokeWidth={2} />
              ) : (
                <Square size={22} color={colors.textMuted} strokeWidth={2} />
              )}
            </Pressable>
          );
        })}
      </View>
      <View className="gap-1">
        {note.map((line) => (
          <Text key={line} className="text-caption text-text-muted">
            {line}
          </Text>
        ))}
      </View>
    </View>
  );
}
