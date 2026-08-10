import { TriangleAlert } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  /** What happened and how to fix it. Never a code, never an apology. */
  message: string;
  /** Offered when trying again is the fix. */
  onRetry?: () => void;
  retryLabel?: string;
};

/**
 * Something failed while the screen still has something to show.
 *
 * Stays quiet and monochrome except for the error line itself, so it never
 * competes with the screen's one yellow action. Icon plus label plus colour, so
 * it reads in greyscale.
 */
export function ErrorNotice({ message, onRetry, retryLabel = "Try again" }: Props) {
  const colors = useThemeColors();

  return (
    <View className="flex-row items-start gap-3 rounded-field border border-error bg-surface p-3">
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
