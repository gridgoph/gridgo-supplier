import { Hash } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { orderReference, orderReferenceSpoken } from "@/lib/orderReference";

type Props = {
  id: string | null | undefined;
};

/**
 * The order's reference, set as a tag.
 *
 * A hash mark and the grouped reference on a quiet pill: it reads as "this
 * job's number" at a glance, the way a ticket or a receipt carries one, and it
 * is the same shape on the notification, the list and the order itself, so a
 * client learns it once. The pill never carries colour — it is identity, not
 * status, and the state chip beside it is the thing that changes.
 */
export function OrderReference({ id }: Props) {
  const colors = useThemeColors();
  const reference = orderReference(id);
  if (!reference) return null;

  return (
    <View
      className="flex-row items-center gap-1 self-start rounded-pill border border-outline-subtle bg-surface-variant px-2 py-0.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={orderReferenceSpoken(id) ?? undefined}
    >
      <Hash size={11} color={colors.textMuted} strokeWidth={2.25} />
      <Text
        className="text-caption font-medium text-text-secondary"
        style={{ letterSpacing: 0.6 }}
        numberOfLines={1}
      >
        {reference}
      </Text>
    </View>
  );
}
