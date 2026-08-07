import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, Briefcase, Calendar, House, User, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useAlertsStore } from "@/store/alerts";

/**
 * One Lucide glyph per tab, all outline, all the same optical weight, so the
 * row reads as one set.
 */
const ICONS: Record<TabName, LucideIcon> = {
  home: House,
  jobs: Briefcase,
  schedule: Calendar,
  notifications: Bell,
  account: User,
};

/**
 * The GRIDGO supplier tab bar.
 *
 * Five labelled destinations. No raised action disc — every tab is a place.
 * Columns bottom-align so all five share a baseline. Geometry leaves slack
 * above the glyph (top padding) so the unread badge can sit proud of the icon
 * without crossing the bar's top border, and labels use a min height so large
 * dynamic type can grow without clipping. Touch targets stay at least 44dp.
 *
 * The open tab is said twice over: its glyph goes to action-yellow and its
 * label to medium yellow. The row still reads in grayscale via weight. Yellow
 * is spent only on the selected item.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unreadCount = useAlertsStore((s) => s.unreadCount);

  return (
    <View className="relative" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      <View className="absolute inset-x-0 bottom-0 top-0 border-t border-outline bg-surface" />

      <View className="flex-row items-end">
        {state.routes.map((route, index) => {
          const tab = TABS.find((entry) => entry.name === route.name);
          if (!tab) return null;

          const focused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          return (
            <TabItem
              key={route.key}
              name={tab.name}
              label={tab.label}
              focused={focused}
              onPress={onPress}
              badge={tab.name === "notifications" ? unreadCount : 0}
            />
          );
        })}
      </View>
    </View>
  );
}

type TabItemProps = {
  name: TabName;
  label: string;
  focused: boolean;
  onPress: () => void;
  badge?: number;
};

function TabItem({ name, label, focused, onPress, badge = 0 }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];
  const showBadge = badge > 0;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={showBadge ? `${label}, ${badge} unread` : label}
      accessibilityState={{ selected: focused }}
      // pt-2 leaves room for the badge's -top-1 overhang; min-h-11 is the
      // 44dp touch floor. No fixed column height — label line box may grow
      // under maxFontSizeMultiplier.
      className="min-h-11 flex-1 items-center justify-end gap-1 pb-2 pt-2"
    >
      {({ pressed }) => (
        <>
          <View className={pressed ? "opacity-60" : undefined}>
            <View className="relative">
              <Icon
                size={24}
                strokeWidth={2}
                color={focused ? colors.actionYellow : colors.textMuted}
              />
              {showBadge ? (
                <View className="absolute -right-2.5 -top-1 min-h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1">
                  <Text
                    maxFontSizeMultiplier={1}
                    className="text-nav font-medium text-accent-on"
                  >
                    {badge > 9 ? "9+" : String(badge)}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
          <Text
            numberOfLines={1}
            maxFontSizeMultiplier={1.4}
            style={{
              includeFontPadding: false,
              textAlignVertical: "center",
              color: focused ? colors.actionYellow : colors.textMuted,
            }}
            className={
              focused ? "min-h-4 text-nav font-medium" : "min-h-4 text-nav"
            }
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
