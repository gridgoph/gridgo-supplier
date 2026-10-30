import { ChevronDown, ReceiptText } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { PACKAGE_INVOICE_REMINDER } from "@/lib/handoff";

/**
 * A standing reminder on the packing and handover screens, not a question: it
 * blocks nothing and asks for no tap. Info-toned and bordered like
 * `ErrorNotice`, with icon plus heading so it reads in greyscale.
 *
 * The rule is the heading and what to do instead sits under it; the reason is
 * one tap away, because at a counter the shop needs the rule, not the
 * explanation, and a second paragraph pushes the handover further down.
 */
export function PackageInvoiceNotice() {
  const colors = useThemeColors();
  const [why, setWhy] = useState(false);

  return (
    <View className="flex-row items-start gap-3 rounded-field border border-info bg-surface p-3">
      <View className="pt-0.5">
        <ReceiptText size={16} color={colors.info} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body font-medium text-text-primary">
          {PACKAGE_INVOICE_REMINDER.title}
        </Text>
        <Text className="text-body text-text-secondary">{PACKAGE_INVOICE_REMINDER.keep}</Text>
        {why ? (
          <Text className="text-body text-text-secondary">{PACKAGE_INVOICE_REMINDER.detail}</Text>
        ) : null}
        <Pressable
          onPress={() => setWhy(!why)}
          accessibilityRole="button"
          accessibilityState={{ expanded: why }}
          accessibilityLabel={why ? "Hide why" : "Why"}
          className="gg-touch flex-row items-center gap-1 self-start"
        >
          <Text className="text-button text-brand">{why ? "Hide why" : "Why"}</Text>
          <View style={{ transform: [{ rotate: why ? "180deg" : "0deg" }] }}>
            <ChevronDown size={16} color={colors.brand} strokeWidth={2} />
          </View>
        </Pressable>
      </View>
    </View>
  );
}
