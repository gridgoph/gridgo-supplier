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
  const colors = useThemeColors();
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

        {/* Destination row — not a primary action. Full-row target, label + chevron. */}
        <Pressable
          onPress={() => router.push("/settings" as Href)}
          accessibilityRole="button"
          accessibilityLabel="Settings"
          className="gg-card mt-4 flex-row items-center justify-between"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <View className="min-w-0 flex-1 gap-1 py-1">
            <Text className="text-body font-medium text-text-primary">Settings</Text>
            <Text className="text-caption text-text-muted">Theme and onboarding</Text>
          </View>
          <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
        </Pressable>

        <View className="gg-card mt-4">
          <Text className="mb-1 text-overline text-text-muted">BACKEND</Text>
          <SpecRow label="API base" value={apiBase} />
        </View>

        <Pressable
          onPress={() => router.push("/payout")}
          accessibilityRole="button"
          className="gg-card mt-3 flex-row items-center justify-between"
        >
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-medium text-text-primary">Protected payment</Text>
            <Text className="text-caption text-text-muted">
              Gross, settlement state, and hold reasons
            </Text>
          </View>
          <Text className="text-caption text-brand">Open</Text>
        </Pressable>

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
