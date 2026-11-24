import { View } from "react-native";
import { Pressable } from "@/components/Pressable";
import { Moon, Sun } from "lucide-react-native";

import { setThemePreference, useThemeColors, useThemeName } from "@/hooks/useTheme";

/**
 * Light or dark, one tap from To do's header (gridgo-supplier#269): a counter
 * by a bright window and one in a dim room want different screens, and
 * Settings is three taps away. Settings still offers "Follow the phone".
 *
 * Two marks in one pill; the one in effect sits on a raised dot, so the state
 * reads in grayscale. On the web build the override cannot apply, and the
 * page keeps following the system.
 */
export function ThemeToggle() {
  const colors = useThemeColors();
  const dark = useThemeName() === "dark";

  return (
    <Pressable
      onPress={() => setThemePreference(dark ? "light" : "dark")}
      accessibilityRole="switch"
      accessibilityLabel="Dark screen"
      accessibilityState={{ checked: dark }}
      hitSlop={4}
      className="gg-touch flex-row items-center gap-0.5 self-center rounded-pill border border-outline bg-surface-variant p-1"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      testID="theme-toggle"
    >
      <View className={dark ? "rounded-pill p-1.5" : "rounded-pill bg-surface-high p-1.5"}>
        <Sun size={16} color={dark ? colors.textMuted : colors.textPrimary} strokeWidth={2} />
      </View>
      <View className={dark ? "rounded-pill bg-surface-high p-1.5" : "rounded-pill p-1.5"}>
        <Moon size={16} color={dark ? colors.textPrimary : colors.textMuted} strokeWidth={2} />
      </View>
    </Pressable>
  );
}
