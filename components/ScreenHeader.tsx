import type { ReactNode } from "react";
import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  title: string;
  subtitle?: string;
  right?: ReactNode;
};

/** Shared tab-screen masthead with safe-area padding. */
export function ScreenHeader({ title, subtitle, right }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <View style={{ paddingTop: Math.max(insets.top, 12) }} className="pb-4">
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
