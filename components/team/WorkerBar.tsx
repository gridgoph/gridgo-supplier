import { Text, View, Pressable } from "react-native";
import { Users } from "lucide-react-native";

import { TeamFace } from "@/components/team/TeamFace";
import { useThemeColors } from "@/hooks/useTheme";
import { useSession } from "@/store/session";
import { useShopWorker } from "@/store/shopWorker";

/**
 * Who the shared shop phone is acting as, on every place, with the way to
 * hand it over.
 *
 * Drawn above the tab bar rather than in a header: it is on every tab without
 * touching any screen, it never fights the notch, and the hand that passes the
 * phone is the hand at the bottom of it. "Switch" locks the phone at once —
 * GRIDGO never falls back to the login's own access — so the next person
 * picks themselves on the picker.
 */
export function WorkerBar() {
  const colors = useThemeColors();
  const worker = useSession((s) => s.user?.worker ?? null);
  const lock = useShopWorker((s) => s.lock);
  if (!worker) return null;

  return (
    <View
      className="flex-row items-center gap-3 border-t border-outline bg-surface px-4 py-2"
      accessibilityRole="summary"
      accessibilityLabel={`${worker.name} is working on this phone`}
      testID="worker-bar"
    >
      <TeamFace name={worker.name} size={36} selected />
      <View className="min-w-0 flex-1">
        <Text className="text-body font-bold text-text-primary" numberOfLines={1}>
          {worker.name} is working
        </Text>
        <Text className="text-caption text-text-muted" numberOfLines={1}>
          Jobs you touch show your name
        </Text>
      </View>
      <Pressable
        onPress={() => void lock()}
        accessibilityRole="button"
        accessibilityLabel="Switch person"
        className="gg-btn gg-btn-secondary h-11"
      >
        {({ pressed }) => (
          <>
            <Users size={18} color={colors.textPrimary} aria-hidden />
            <Text className="text-button text-text-primary">Switch</Text>
            {pressed ? <View className="gg-pressed absolute inset-0 rounded-field" /> : null}
          </>
        )}
      </Pressable>
    </View>
  );
}
