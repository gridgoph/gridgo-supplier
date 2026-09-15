import { Text, View } from "react-native";
import { SpecRow } from "@/components/SpecRow";
import type { Order } from "@/lib/api";
import { orderProductionItems, productionSpecRows } from "@/lib/productionSpecs";

/** The saved specification for every item, shared by job detail and counter QC. */
export function ProductionSpecifications({ order }: { order: Order }) {
  return <View className="gap-3">{orderProductionItems(order).map((item) => (
    <View key={item.id} className="gap-2">
      <Text className="text-body font-medium text-text-primary">{item.itemName}</Text>
      <View className="gg-card-flush px-4">
        {productionSpecRows(item).map((row, index) => <SpecRow key={`${row.label}:${index}`} label={row.label} value={row.value} />)}
      </View>
    </View>
  ))}</View>;
}
