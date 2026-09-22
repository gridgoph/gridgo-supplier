import type { ReactNode } from "react";
import { Text, View } from "react-native";

export function ListingSection({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <View className="mt-8 gap-3">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">{title}</Text>
        {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}
