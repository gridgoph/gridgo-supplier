import { Pressable, Text, View } from "react-native";
import { Circle, CircleCheck } from "lucide-react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { SELF_QC_CHECKS } from "@/lib/jobState";

type Props = {
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
};

/**
 * Production self-QC evidence presentation. Each item is a fact the supplier
 * confirms before marking the job ready for rider handoff. The demo API has no
 * photo upload — confirmation of the checklist is the evidence surface.
 */
export function SelfQcChecklist({ checked, onToggle }: Props) {
  const colors = useThemeColors();

  return (
    <View className="gap-2">
      <Text className="text-body text-text-secondary">
        Confirm each check before you mark self-QC complete. This is the record
        Operations and the client rely on.
      </Text>
      {SELF_QC_CHECKS.map((item) => {
        const on = checked[item.id] === true;
        return (
          <Pressable
            key={item.id}
            onPress={() => onToggle(item.id)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: on }}
            accessibilityLabel={item.label}
            className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
          >
            {on ? (
              <CircleCheck size={22} color={colors.success} strokeWidth={2} />
            ) : (
              <Circle size={22} color={colors.textMuted} strokeWidth={2} />
            )}
            <Text
              className={
                on
                  ? "flex-1 text-body text-text-primary"
                  : "flex-1 text-body text-text-secondary"
              }
            >
              {item.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
