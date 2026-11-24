import { Users } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { groupTagLabel, type ExpressGroup } from "@/lib/expressOrder";

/**
 * "Group order, 4 people": one Express order a host paid for, whose prints
 * leave the shop as one bundle per person. A tag like `ExpressChip`, in the
 * same neutral outline, so it reads as what the job is rather than a status.
 */
export function GroupOrderChip({ group }: { group: ExpressGroup }) {
  const colors = useThemeColors();
  return (
    <View className="gg-chip" accessibilityRole="text" testID="group-order-chip">
      <Users size={13} color={colors.info} strokeWidth={2} />
      <Text className="text-caption text-text-primary">{groupTagLabel(group)}</Text>
    </View>
  );
}
