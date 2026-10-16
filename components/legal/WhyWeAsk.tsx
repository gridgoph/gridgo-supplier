import { Info } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";

/**
 * "Why we ask", in one line beside the field or the camera it explains.
 *
 * Said where the data is given, not in a policy nobody opens: a phone number,
 * the shop's pin, a photo. The purpose is specific to that capture — "to send
 * riders to your counter", never "to improve our services". The lines live in
 * `lib/legal.ts` (`WHY_WE_ASK`) so a capture says the same thing everywhere.
 *
 * `centered` is for a capture that is itself centred (the shop photo), where a
 * left-aligned footnote would read as belonging to something else.
 */
export function WhyWeAsk({ children, centered = false }: { children: string; centered?: boolean }) {
  const colors = useThemeColors();
  return (
    <View
      className={
        centered
          ? "flex-row items-start justify-center gap-2 self-stretch"
          : "flex-row items-start gap-2"
      }
      accessible
      accessibilityLabel={`Why we ask: ${children}`}
    >
      <Info size={14} color={colors.textMuted} style={{ marginTop: 2 }} aria-hidden />
      <Text
        className={
          centered
            ? "shrink text-center text-caption text-text-muted"
            : "min-w-0 flex-1 text-caption text-text-muted"
        }
      >
        {children}
      </Text>
    </View>
  );
}
