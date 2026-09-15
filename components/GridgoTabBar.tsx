import type { BottomTabBarProps } from "expo-router/js-tabs";
import { Briefcase, Calendar, Frame, House, User, type LucideIcon } from "lucide-react-native";
import { Platform, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";

/* ---------------------------------------------------------------------------
   Bar geometry

   Two platforms with two different published answers, and one rule they agree
   on. Getting either half wrong has been reported by the captain once each.

   **iOS.** The Human Interface Guidelines tab bar is a 49pt content row, and on
   a home-indicator iPhone the bar is 83pt overall — 49 of content plus the 34pt
   bottom safe-area inset. UIKit does not put design padding under the labels on
   top of that inset; the inset *is* the space. This bar did, and stacked an
   80dp column on top of it as well: 80 + 34 + 8 = 122pt against the platform's
   83. That is the "tab bar sits too high" report.

   **Android.** Material 3's navigation bar container is 80dp with 12dp above
   the item and 16dp below it, and `NavigationBarDefaults.windowInsets` adds the
   bottom system-bar inset *beneath* that container rather than inside it. So
   80dp is the bar and the inset is what sits under it — never a third gap
   between the two. A bar that had only its 8dp design gap and no inset at all
   was the opposite report, which is why `Math.max(inset, pad)` alone was banned:
   it silently discarded the design gap.

   Under edge-to-edge — `android.edgeToEdgeEnabled` in `app.json`, and mandatory
   from Android 15 anyway — that inset is real on both navigation modes. It is
   the *three-button* bar that reserves the most (48dp) and gesture navigation
   that reserves less (24dp); a zero bottom inset on Android means the nav bar
   is hidden, or Expo web. That is the opposite of the intuition that a
   three-button phone reports nothing, and it is why adding a gap on top of the
   inset overshot on every modern Android device rather than just some of them.

   **The rule both follow.** Where the platform reserves a bottom inset, that
   inset is the breathing room and nothing is added to it. Where it reserves
   none — an iPhone SE, a phone with the nav bar hidden, Expo web — the design
   gap stands in, so labels are never flush against the physical edge.

   Resulting bar heights, content column plus whatever sits under it:
     iOS, home indicator     49 + 34 = 83pt   (UIKit exactly)
     iOS, no indicator       49 +  8 = 57pt
     Android, gesture nav    80 + 24 = 104dp
     Android, three-button   80 + 48 = 128dp
     Android/web, no inset   80 +  8 =  88dp

   These are the client's numbers, to the point. All three GRIDGO apps carry the
   same bar arithmetic; only what stands in the columns differs.
   --------------------------------------------------------------------------- */

/** Used only where the platform reserves no bottom inset of its own. */
export const TAB_BAR_MIN_BOTTOM_GAP = 8;

/** One outline size for every destination, so the row is one set. */
export const TAB_ICON_SIZE = 24;

export type TabBarMetrics = {
  /** The content row, above whatever the platform reserves below it. */
  columnHeight: number;
  itemPaddingTop: number;
  itemGap: number;
  itemPaddingBottom: number;
};

/**
 * Pure, so both platforms' geometry can be asserted in one test run rather
 * than only whichever one the suite happens to be executing on.
 */
export function tabBarMetrics(platformOS: string): TabBarMetrics {
  if (platformOS === "ios") {
    // 4 + 24 icon + 2 + 16 label + 3 = 49, the HIG row exactly.
    return { columnHeight: 49, itemPaddingTop: 4, itemGap: 2, itemPaddingBottom: 3 };
  }
  // Material 3: 80dp container, 12dp above the item, 16dp below it, 24dp icon.
  return { columnHeight: 80, itemPaddingTop: 12, itemGap: 4, itemPaddingBottom: 16 };
}

export const TAB_BAR_METRICS = tabBarMetrics(Platform.OS);

/**
 * What sits below the content row: the platform's own inset where there is
 * one, and the design gap only where there is not.
 *
 * Not `inset + gap`: on a home-indicator iPhone that added 8pt to a 34pt
 * keep-out zone the platform had already sized as the bar's breathing room, and
 * on an edge-to-edge Android it added the same 8dp to a 48dp navigation bar.
 * Not a bare `Math.max` either — the intent is the reason, and a future reader
 * needs to see that the design gap is a floor for insetless devices, not an
 * alternative to the inset.
 */
export function tabBarPaddingBottom(insetBottom: number): number {
  return insetBottom > 0 ? insetBottom : TAB_BAR_MIN_BOTTOM_GAP;
}

/**
 * One glyph each, and the fourth is the only one worth arguing about.
 *
 * Catalogues is a wall of print samples, and Lucide's `Frame` is four rules
 * crossing and running past the corners — which is exactly a crop mark, the
 * thing a printer trims to and the mark every listing photo in this app already
 * wears (`components/CropMarkFrame`). So the tab that opens the wall carries
 * the same mark the wall is built from, rather than the grid of rounded squares
 * every other product reaches for.
 *
 * It is also the only open glyph in the row. House, Briefcase, Calendar and
 * User are all closed outlines, so a shop finds this one by silhouette before
 * it reads the label.
 */
const ICONS: Record<TabName, LucideIcon> = {
  home: House,
  jobs: Briefcase,
  schedule: Calendar,
  catalogues: Frame,
  account: User,
};

/**
 * The GRIDGO supplier tab bar.
 *
 * Five labelled destinations. No raised action disc — every tab is a place.
 * Each destination owns the same share of the bar (`flex-1`), icon and label
 * centred in that share, the way a five-up phone bar is actually read: equal
 * gaps between marks, and the same distance from the left edge to Home as from
 * Account to the right edge. Sizing each column to its own label ("Home" vs
 * "Catalogues") made those two distances different even when the leftover was
 * split evenly around the boxes. They bottom-align so all five share a baseline.
 *
 * The surface paints the whole container, so the bar a person sees is exactly
 * `content region + design pad + system inset` and nothing has to be subtracted
 * to reason about it. It used to be inset 16dp from the top of the container,
 * which made every measurement two numbers and existed to keep a raised action
 * disc inside the paint — this app has never had one.
 *
 * The heights themselves are in the geometry note above this file's metrics.
 *
 * Column content is icon (24) + `itemGap` + label (16) inside the platform's
 * own item padding, bottom-aligned; on Android the residual slack inside the
 * 80dp container sits above the icon. The 44dp touch floor is exceeded on both.
 *
 * The open tab is said twice over, in colour and in weight, so the row still
 * reads in grayscale. The open mark is the same off-white the rider bar uses
 * (`textPrimary`); yellow stays on the shop's own buttons, not on the bar.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      testID="gridgo-tab-bar"
      className="relative"
      style={{ paddingBottom: tabBarPaddingBottom(insets.bottom) }}
    >
      <View
        testID="gridgo-tab-bar-surface"
        className="absolute inset-0 border-t border-outline bg-surface"
      />

      <View
        testID="gridgo-tab-bar-row"
        className="w-full flex-row items-end"
        style={{ paddingLeft: insets.left, paddingRight: insets.right }}
      >
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
};

/**
 * One destination. Nothing in this bar counts anything.
 *
 * The unread badge used to hang off the Alerts tab; alerts are now a bell in
 * every masthead and the badge went with them. A bar that carries a number on
 * one column is a bar a shop reads for numbers, and these five are places.
 */
function TabItem({ name, label, focused, onPress }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      // Height and padding are the platform's, from `tabBarMetrics`. A minimum
      // rather than a fixed height, so the column still grows when the label
      // scales under dynamic type; never a rigid h-13, which clipped it.
      className="min-w-0 flex-1 items-center justify-end"
      style={{
        minHeight: TAB_BAR_METRICS.columnHeight,
        paddingTop: TAB_BAR_METRICS.itemPaddingTop,
        paddingBottom: TAB_BAR_METRICS.itemPaddingBottom,
        rowGap: TAB_BAR_METRICS.itemGap,
      }}
    >
      {({ pressed }) => (
        <>
          <View className={pressed ? "opacity-60" : undefined}>
            <Icon
              size={TAB_ICON_SIZE}
              strokeWidth={2}
              color={focused ? colors.textPrimary : colors.textMuted}
            />
          </View>
          <Text
            numberOfLines={1}
            /*
              The label still grows with the system font scale, but only to
              14px — the most a 16px line box holds. Left uncapped, a large
              accessibility scale clips the label against the pinned box below,
              and letting the box grow instead would hand the bar's height back
              to text metrics rather than the platform's published figure.
            */
            maxFontSizeMultiplier={1.4}
            /*
              Android pads a text box with the font's own ascent and descent on
              top of the line height. Left on, Satoshi's metrics make this label
              taller than the 16px the type scale promises, which pushes the
              glyph away from its icon and shoves the icon up into the hairline.
              Off, the box is the 16px it claims to be on every platform — which
              is what makes the column exactly 49pt and 80dp.
            */
            style={{
              includeFontPadding: false,
              textAlignVertical: "center",
            }}
            className={
              focused
                ? "h-4 w-full text-center text-nav font-medium text-text-primary"
                : "h-4 w-full text-center text-nav text-text-muted"
            }
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}
