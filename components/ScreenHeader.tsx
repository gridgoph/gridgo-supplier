import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { spacing } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  title: string;
  /**
   * One short line above the title. Use it for something that is true right
   * now — a greeting, a date — never for a second name for the screen.
   */
  eyebrow?: string;
  subtitle?: string;
  right?: ReactNode;
  /**
   * The place this page sits in, for a page the bar does not show (All jobs,
   * Schedule, Products): a chevron and the place's name above the title.
   */
  back?: { label: string; onPress: () => void };
};

/**
 * Shared tab-screen masthead.
 *
 * A tab draws its own header, so this is the only thing between the title and
 * the status bar. The system inset is the keep-out zone and the 12 is design
 * breathing room, so they stack — the same rule `GridgoTabBar` follows at the
 * other end of the screen. Taking the larger of the two instead spent the whole
 * gap on the notch and left the title against the clock on every modern phone.
 */
export function ScreenHeader({ title, eyebrow, subtitle, right, back }: Props) {
  const insets = useSafeAreaInsets();
  const colors = useThemeColors();

  return (
    <View style={{ paddingTop: insets.top + spacing.md }} className="pb-4">
      {back ? (
        <Pressable
          onPress={back.onPress}
          accessibilityRole="button"
          accessibilityLabel={`Back to ${back.label}`}
          hitSlop={8}
          className="gg-touch -ml-1 mb-1 flex-row items-center gap-0.5 self-start"
          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
          testID="screen-header-back"
        >
          <ChevronLeft size={22} color={colors.textPrimary} strokeWidth={2} />
          <Text className="text-body font-medium text-text-primary">{back.label}</Text>
        </Pressable>
      ) : null}
      <View className="flex-row items-start justify-between gap-3">
        <View className="min-w-0 flex-1">
          {eyebrow ? (
            <Text className="mb-0.5 text-body text-text-secondary">{eyebrow}</Text>
          ) : null}
          <Text className="text-h2 text-text-primary">{title}</Text>
          {subtitle ? (
            <Text className="mt-1 text-body text-text-secondary">{subtitle}</Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}
