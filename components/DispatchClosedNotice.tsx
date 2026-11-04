import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";

/**
 * A job marked ready while GRIDGO's dispatch is closed. An empty Offers list is
 * all a rider sees until it opens, so the shop is told when that is.
 */
export function DispatchClosedNotice({ line }: { line: string }) {
  return (
    <View className="gg-panel gap-2" testID="dispatch-closed-notice">
      <View className="flex-row">
        <StatusChip tone="info" label="Dispatch is closed" icon="clock" />
      </View>
      <Text className="text-body font-medium text-text-primary">{line}</Text>
    </View>
  );
}
