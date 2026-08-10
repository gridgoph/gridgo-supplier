import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, Briefcase, Calendar, House, User, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";
import { useAlertsStore } from "@/store/alerts";

/**
 * Bar geometry, which the two platforms genuinely disagree about.
 *
 * Apple's tab bar is 49pt and sits directly on the 34pt home-indicator inset —
 * 83pt in total on a modern iPhone. Material Design 3's navigation bar is 80dp
 * with the system inset below it. One number cannot be both, and using the
 * Android figure on iOS is what made the bar stand too far off the bottom of
 * the screen: 80 + 34 + 8 is 122pt where Apple asks for 83.
 *
 * So the content region is per-platform and the system inset still **stacks**
 * on top of it. Never `Math.max`: the inset is the OS keep-out zone and the pad
 * is intentional spacing, and taking the larger of the two spends the whole gap
 * on the notch.
 */
export const TAB_BAR_CONTENT_MIN_HEIGHT = Platform.OS === "ios" ? 49 : 80;

/**
 * Breathing room below the row, on top of the system inset.
 *
 * Android keeps it: MD3's 80dp is the bar itself, the system inset sits under
 * it, and dropping this pad is what made the bar feel tight. iOS gets none —
 * the 34pt home-indicator inset is Apple's own breathing room, and on a device
 * without one the column already clears the 49pt bar on its own.
 */
export const TAB_BAR_BOTTOM_DESIGN_PAD = Platform.OS === "ios" ? 0 : 8;

/**
 * Column padding above and below the icon/label pair.
 *
 * Android's 80dp floor leaves room for the roomier pad; iOS has to fit the same
 * 24pt icon and label inside a bar two thirds the height, so it takes the
 * tighter one. Intrinsic column height is therefore 60dp on Android (inside the
 * 80dp floor) and 52pt on iOS (which is what the bar actually becomes, three
 * points over Apple's 49 because this type scale's label line box is 16pt).
 */
export const TAB_ITEM_PADDING_CLASS =
  Platform.OS === "ios" ? "pb-1 pt-1" : "pb-2 pt-2";

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
 * The surface paints the whole container, so the bar a person sees is exactly
 * `content region + design pad + system inset` and nothing has to be subtracted
 * to reason about it. It used to be inset 16dp from the top of the container,
 * which made every measurement two numbers and existed to keep a raised action
 * disc inside the paint — this app has never had one.
 *
 * Resulting bar heights:
 *   iOS, home-indicator iPhone:  52 +  0 + 34 =  86pt   (Apple: 49 + 34 = 83)
 *   iOS, no home indicator:      52 +  0 +  0 =  52pt   (Apple: 49)
 *   Android, gesture nav:        80 +  8 + 24 = 112dp   (MD3: 80 + inset)
 *   Android, three-button:       80 +  8 + 48 = 136dp
 *
 * Column content is icon (24) + gap-1 (4) + label min-h-4 (16) inside the
 * per-platform padding, bottom-aligned. On Android the residual slack inside
 * the 80dp floor sits above the icon and covers the unread badge's overhang;
 * on iOS the badge overhangs into the tighter top pad, which the column's own
 * min-height absorbs. The 44dp touch floor is exceeded on both.
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
      <View
        testID="gridgo-tab-bar-surface"
        className="absolute inset-0 border-t border-outline bg-surface"
      />

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
      // Height floor and padding are per-platform — see the constants above.
      // Never a fixed height: the label line box grows under a capped
      // maxFontSizeMultiplier and the min-height is what absorbs it.
      style={{ minHeight: TAB_BAR_CONTENT_MIN_HEIGHT }}
      className={`flex-1 items-center justify-end gap-1 ${TAB_ITEM_PADDING_CLASS}`}
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
