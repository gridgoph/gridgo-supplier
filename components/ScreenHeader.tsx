import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

/**
 * Shared tab-screen masthead.
 *
 * A tab draws its own header, so this is the only thing between the title and
 * the status bar. The system inset is the keep-out zone and the 12 is design
 * breathing room, so they stack — the same rule `GridgoTabBar` follows at the
 * other end of the screen. Taking the larger of the two instead spent the whole
 * gap on the notch and left the title against the clock on every modern phone.
 */
export function ScreenHeader({ title, subtitle, right }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: insets.top + spacing.md }} className="pb-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          <Text className="text-h2 text-text-primary">{title}</Text>
          {subtitle ? (
            <Text className="mt-1 text-body text-text-secondary">{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}
