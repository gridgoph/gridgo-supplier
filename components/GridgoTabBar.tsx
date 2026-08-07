import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, Briefcase, Calendar, House, User, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useAlertsStore } from "@/store/alerts";

/**
 * Design breathing room beneath the tab row, stacked on the system bottom
 * inset — never Math.max'd with it. `insets.bottom` is the OS keep-out zone
 * (gesture bar / three-button nav); this pad is intentional content spacing.
 */
export const TAB_BAR_BOTTOM_DESIGN_PAD = 8;

/**
 * Material Design 3 navigation bar height for icon + label (dp). Columns use
 * this as min-height so the content region matches platform standard; the
 * system inset is extra, below, via container paddingBottom.
 */
export const TAB_BAR_CONTENT_MIN_HEIGHT = 80;

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
 * Columns bottom-align so all five share a baseline.
 *
 * Geometry (default font scale, content region only — system inset is separate):
 *   pt-4 (16) + icon (24) + gap-1 (4) + label min-h-4 (16) + pb-4 (16) = 76
 *   min-h-20 (80) is the MD3 platform floor; residual 4dp sits as top slack
 *   above the icon (justify-end). Touch floor 44dp is exceeded comfortably.
 *   Top padding also covers the unread badge's -top-1 overhang.
 *
 * Bottom padding of the bar container is `insets.bottom + design pad` so the
 * OS keep-out zone and design breathing room stack. The surface (and top
 * border) still paints through the inset region to the physical edge.
 *
 * The open tab is said twice over: its glyph goes to action-yellow and its
 * label to medium yellow. The row still reads in grayscale via weight. Yellow
 * is spent only on the selected item.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const unreadCount = useAlertsStore((s) => s.unreadCount);

  return (
    <View
      testID="gridgo-tab-bar"
      className="relative"
      style={{ paddingBottom: insets.bottom + TAB_BAR_BOTTOM_DESIGN_PAD }}
    >
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
      // MD3 icon+label bar = 80dp (min-h-20). pt-4 covers badge overhang;
      // no fixed column height — label line box may grow under a capped
      // maxFontSizeMultiplier and the min-height absorbs it.
      className="min-h-20 flex-1 items-center justify-end gap-1 pb-4 pt-4"
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
            // Cap growth so five labels still fit a narrow phone, but allow
            // ~40% dynamic type (min-h-20 can absorb a taller line box). A
            // hard 1.0 would ignore accessibility text entirely.
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
