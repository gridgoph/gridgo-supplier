import { Bell } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { useAlertsStore } from "@/store/alerts";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The alerts inbox, from wherever the shop happens to be standing.
 *
 * Alerts used to be a tab, which made an inbox one of the five places a shop
 * lives. It is not a place — it is something a shop glances at while it works,
 * the same way it glances at a phone on the bench — so it moved to the corner
 * of every masthead in the bar and gave its column to the catalogue.
 *
 * It is a real bell, deliberately. The corner of a mobile header is where a
 * bell goes, and the one thing that corner must never be is ambiguous: a shop
 * looking for its alerts should not have to work out that a pill counting
 * today's jobs was the closest thing to them.
 *
 * The badge is the one the tab bar used to draw, to the pixel. A shop learned
 * that mark on the Alerts tab, and a badge that changes shape when it moves
 * teaches the shop nothing except that marks in this app are not to be trusted.
 * Nine and up reads "9+": past that the number stops being a count and starts
 * being a wall, and the answer to either is to open the list.
 */
export function AlertsBell() {
  const colors = useThemeColors();
  const unread = useAlertsStore((s) => s.unreadCount);
  const showBadge = unread > 0;

  return (
    <Pressable
      onPress={() => router.push("/alerts")}
      accessibilityRole="button"
      accessibilityLabel={showBadge ? `Alerts, ${unread} unread` : "Alerts"}
      // The touch box sits inside the page gutter rather than hanging off it,
      // which puts the badge — the loudest thing here, and the only part that
      // overhangs the glyph — exactly on the 16pt margin the title is set to.
      className="gg-touch items-center justify-center"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <View className="relative">
        <Bell size={24} strokeWidth={2} color={colors.textPrimary} />
        {showBadge ? (
          <View className="absolute -right-2.5 -top-1 min-h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1">
            <Text maxFontSizeMultiplier={1} className="text-nav font-medium text-accent-on">
              {unread > 9 ? "9+" : String(unread)}
            </Text>
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
