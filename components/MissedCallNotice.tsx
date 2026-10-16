import { PhoneMissed } from "lucide-react-native";
import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { missedAtLabel, type MissedCall } from "@/lib/orderCall";

/**
 * "Missed call from Sam", with the way to call back. Drawn near the top of the
 * job while calling is still open, and gone once any later call happens.
 * Call back is charcoal: the job's own next step keeps the yellow.
 */
export function MissedCallNotice({ missed, onCallBack }: { missed: MissedCall; onCallBack: () => void }) {
  const colors = useThemeColors();
  return (
    <View className="gg-card gap-3" testID="missed-call-notice">
      <View className="flex-row gap-3">
        <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
          <PhoneMissed size={18} color={colors.error} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body-lg font-medium text-text-primary">{missed.title}</Text>
          <Text className="text-caption text-text-muted">
            {missedAtLabel(missed.at)}. The rider is on the way to collect this job.
          </Text>
        </View>
      </View>
      <SecondaryButton label="Call back" onPress={onCallBack} />
    </View>
  );
}
