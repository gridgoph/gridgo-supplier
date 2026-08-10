import { ChevronRight } from "lucide-react-native";
import { Pressable, ScrollView, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { ScreenHeader } from "@/components/ScreenHeader";
import { SpecRow } from "@/components/SpecRow";
import { getApiBase } from "@/lib/api";
import { useThemeColors } from "@/hooks/useTheme";
import { useSession } from "@/store/session";

export default function AccountScreen() {
  const user = useSession((s) => s.user);
  const logout = useSession((s) => s.logout);
  const apiBase = getApiBase();

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page pb-10" showsVerticalScrollIndicator={false}>
        <ScreenHeader title="Account" subtitle="Identity and connection" />

        <View className="gg-card">
          <SpecRow label="Name" value={user?.name || "—"} />
          <SpecRow label="Email" value={user?.email || "—"} />
          <SpecRow label="Shop" value={user?.supplierName || "—"} />
          <SpecRow label="Role" value="Supplier" />
        </View>

        {/* Destination rows — not primary actions. Full-row target, label + chevron. */}
        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">SHOP</Text>
          <DestinationRow
            title="Capacity & closures"
            detail="What you can take on each day, and the days you are shut"
            onPress={() => router.push("/capacity")}
          />
          <DestinationRow
            title="Protected payment"
            detail="Gross, settlement state, and hold reasons"
            onPress={() => router.push("/payout")}
          />
        </View>

        <View className="mt-6 gap-2">
          <Text className="text-overline text-text-muted">APP</Text>
          <DestinationRow
            title="Settings"
            detail="Theme and onboarding"
            onPress={() => router.push("/settings" as Href)}
          />
        </View>

        <View className="gg-card mt-6">
          <Text className="mb-1 text-overline text-text-muted">BACKEND</Text>
          <SpecRow label="API base" value={apiBase} />
        </View>

        <Pressable
          onPress={() => void logout()}
          accessibilityRole="button"
          className="gg-btn-secondary mt-8"
        >
          <Text className="text-button text-text-primary">Sign out</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function DestinationRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      className="gg-touch flex-row items-center gap-3 rounded-card border border-outline bg-surface px-4 py-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body font-medium text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted">{detail}</Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
    </Pressable>
  );
}
