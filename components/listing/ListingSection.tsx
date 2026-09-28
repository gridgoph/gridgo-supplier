import type { ReactNode } from "react";
import { Text, View } from "react-native";

export function ListingSection({
  title,
  hint,
  children,
  spaced = true,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  /** False when a wrapper carries the gap above (a tour target lights the section, not the gap). */
  spaced?: boolean;
}) {
  return (
    <View className={spaced ? "mt-8 gap-3" : "gap-3"}>
      <View className="gap-1">
        <Text className="text-overline text-text-muted">{title}</Text>
        {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}
