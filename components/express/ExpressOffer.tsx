import { Text, View } from "react-native";
import { Banknote, Layers } from "lucide-react-native";

import { ExpressCountdown } from "@/components/ExpressCountdown";
import { ExpressPrintList } from "@/components/ExpressPrintList";
import { useThemeColors } from "@/hooks/useTheme";
import type { Order } from "@/lib/api";
import { formatPhp } from "@/lib/money";
import type { ExpressView } from "@/lib/expressOrder";

type Props = {
  order: Order;
  view: ExpressView;
  /** Staff accept for the shop; the money is the Owner's. */
  hideEarnings?: boolean;
  onExpire?: () => void;
};

/**
 * An incoming Express order: the clock, what the shop earns, and what to print.
 * Shared by the job screen and the accept screen so the two never disagree.
 */
export function ExpressOffer({ order, view, hideEarnings = false, onExpire }: Props) {
  const colors = useThemeColors();
  const price = order.supplierPriceMinor;
  return (
    <View className="gap-3" testID="express-offer">
      <ExpressCountdown order={order} onExpire={onExpire} />
      <View className="flex-row gap-3">
        {hideEarnings ? null : (
          <View className="gg-card min-w-0 flex-1 gap-1" testID="express-earn">
            <View className="flex-row items-center gap-1.5">
              <Banknote size={16} color={colors.textMuted} strokeWidth={2} />
              <Text className="text-caption text-text-muted">You earn</Text>
            </View>
            <Text className="text-h2 text-text-primary">{price != null ? formatPhp(price) : "—"}</Text>
          </View>
        )}
        <View className="gg-card min-w-0 flex-1 gap-1">
          <View className="flex-row items-center gap-1.5">
            <Layers size={16} color={colors.textMuted} strokeWidth={2} />
            <Text className="text-caption text-text-muted">Pages</Text>
          </View>
          <Text className="text-h2 text-text-primary">{view.totalPages ?? "—"}</Text>
          <Text className="text-caption text-text-secondary">
            {view.fulfillment === "pickup" ? "Client picks up here" : "Rider delivers"}
          </Text>
        </View>
      </View>
      <ExpressPrintList view={view} />
    </View>
  );
}
