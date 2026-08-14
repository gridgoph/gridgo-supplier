import { Text, View } from "react-native";

export function AuthDivider() {
  return (
    <View className="flex-row items-center gap-3" accessibilityRole="text">
      <View className="h-px flex-1 bg-outline" />
      <Text className="text-caption text-text-muted">OR</Text>
      <View className="h-px flex-1 bg-outline" />
    </View>
  );
}
