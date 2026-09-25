import { ReceiptText } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { PACKAGE_INVOICE_REMINDER } from "@/lib/handoff";

/**
 * A standing reminder on the packing and handover screens, not a question: it
 * blocks nothing and asks for no tap. Info-toned and bordered like
 * `ErrorNotice`, with icon plus heading so it reads in greyscale.
 */
export function PackageInvoiceNotice() {
  const colors = useThemeColors();

  return (
    <View className="flex-row items-start gap-3 rounded-field border border-info bg-surface p-3">
      <View className="pt-0.5">
        <ReceiptText size={16} color={colors.info} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-body font-medium text-text-primary">
          {PACKAGE_INVOICE_REMINDER.title}
        </Text>
        <Text className="text-body text-text-secondary">{PACKAGE_INVOICE_REMINDER.detail}</Text>
        <Text className="text-body text-text-secondary">{PACKAGE_INVOICE_REMINDER.keep}</Text>
      </View>
    </View>
  );
}
