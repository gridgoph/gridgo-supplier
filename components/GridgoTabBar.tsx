import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Bell, FileText, House, Plus, User, type LucideIcon } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ACTION_TAB, TABS, type TabName } from "@/constants/tabs";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * One Lucide glyph per tab, all outline, all the same optical weight, so the
 * row reads as one set.
 */
const ICONS: Record<TabName, LucideIcon> = {
  home: House,
  orders: FileText,
  "new-request": Plus,
  notifications: Bell,
  account: User,
};

/**
 * The GRIDGO tab bar.
 *
 * Four labelled destinations and one unlabelled action.
 *
 * The labelled columns are a fixed 52px: an 8px foot, a 16px label box, a 4px
 * gap and a 24px glyph, bottom-aligned so all four share a baseline. Every one
 * of those boxes is pinned rather than measured, so no platform's text metrics
 * can move the icons. The action is a 56px disc — no label, because a filled
 * yellow plus in the middle of a tab bar needs no caption, and captioning it
 * would put a fifth word in a row of four.
 *
 * The disc's column is taller than the labelled ones, so the disc rises out of
 * the row on its own and the bar surface, which starts 16px below the row's
 * top edge, is what it breaks through. Nothing is ever drawn outside its
 * parent, which Android will not reliably render.
 *
 * The open tab is said twice over, in colour and in weight: its glyph goes
 * from muted to full-strength ink and its label from muted regular to medium.
 * The row therefore still reads correctly in grayscale. Yellow is spent in one
 * place only — the disc that starts a print request.
 */
export function GridgoTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View className="relative" style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      {/*
        Drawn before the row, so the action disc paints over the top border and
        the hairline breaks around it with no cut-out to maintain.
      */}
      <View className="absolute inset-x-0 bottom-0 top-4 border-t border-outline bg-surface" />

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

function TabItem({ name, label, focused, onPress }: TabItemProps) {
  const colors = useThemeColors();
  const Icon = ICONS[name];

  // 84 tall against the destinations' 56, which is what lifts the disc out of
  // the row. Its foot lands just above the labels' cap line, so the four
  // destinations and the action still read as one row rather than two.
  if (name === ACTION_TAB) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="tab"
        accessibilityLabel={label}
        accessibilityState={{ selected: focused }}
        className="h-20 flex-1 items-center"
      >
        {({ pressed }) => (
          <View className="h-14 w-14 items-center justify-center rounded-pill bg-action-yellow">
            <Icon size={26} color={colors.actionYellowOn} strokeWidth={2.5} />
            {pressed ? <View className="gg-pressed absolute inset-0 rounded-pill" /> : null}
          </View>
        )}
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: focused }}
      className="h-13 flex-1 items-center justify-end gap-1 pb-2"
    >
      {({ pressed }) => (
        <>
          {/*
            One glyph, one size, one stroke weight, in both states. Only the
            colour moves — nothing is filled, swapped or rescaled when a tab
            opens, so the row never shifts under your thumb.
          */}
          <View className={pressed ? "opacity-60" : undefined}>
            <Icon
              size={24}
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
              to text metrics, which is the bug the next comment describes.
            */
            maxFontSizeMultiplier={1.4}
            /*
              Android pads a text box with the font's own ascent and descent on
              top of the line height. Left on, Satoshi's metrics make this label
              taller than the 16px the type scale promises, which pushes the
              glyph away from its icon and shoves the icon up into the hairline.
              Off, the box is the 16px it claims to be on every platform.
            */
            style={{ includeFontPadding: false, textAlignVertical: "center" }}
            className={
              focused ? "h-4 text-nav font-medium text-text-primary" : "h-4 text-nav text-text-muted"
            }
          >
            {label}
          </Text>
        </>
      )}
    </Pressable>
  );
}

