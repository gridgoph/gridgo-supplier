import { TriangleAlert } from "lucide-react-native";
import { useEffect } from "react";
import { AccessibilityInfo, Platform, Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** What happened and how to fix it. Never a code, never an apology. */
  message: string;
  /** Offered when trying again is the fix. */
  onRetry?: () => void;
  retryLabel?: string;
  /**
   * Say the message aloud when it appears. For a failure that arrives on its
   * own, after the person has moved on (a location fix, a lookup), where a
   * screen reader would otherwise never reach it. Android and web read the
   * alert role and live region; iOS has no live regions, so it is announced.
   */
  announce?: boolean;
};

/**
 * Something failed while the screen still has something to show.
 *
 * Stays quiet and monochrome except for the error line itself, so it never
 * competes with the screen's one yellow action. Icon plus label plus colour, so
 * it reads in greyscale.
 */
export function ErrorNotice({ message, onRetry, retryLabel = "Try again", announce = false }: Props) {
  const colors = useThemeColors();

  useEffect(() => {
    if (announce && Platform.OS === "ios") AccessibilityInfo.announceForAccessibility(message);
  }, [announce, message]);

  return (
    <View
      className="flex-row items-start gap-3 rounded-field border border-error bg-surface p-3"
      accessibilityRole={announce ? "alert" : undefined}
      accessibilityLiveRegion={announce ? "assertive" : undefined}
      aria-live={announce ? "assertive" : undefined}
    >
      <View className="pt-0.5">
        <TriangleAlert size={16} color={colors.error} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-2">
        <Text className="text-body text-text-primary">{message}</Text>
        {onRetry ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            className="gg-touch justify-center self-start"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Text className="text-button text-error">{retryLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
