import { Text, View } from "react-native";

import type { ProductionItem } from "@/lib/api";
import { itemNote } from "@/lib/orderChanges";

/**
 * One item's special instructions and agreed change, under its specification.
 * Once the job is accepted they are part of what was agreed, so they stay in
 * the docket after the panel above it is gone.
 */
export function ItemNote({ item }: { item: Pick<ProductionItem, "specialInstructions" | "agreedChange"> }) {
  const note = itemNote(item);
  if (!note.text && !note.agreedChange) return null;
  return (
    <View className="flex-row gap-3 pb-2 pt-3">
      <View className="w-1 rounded-pill bg-warning" />
      <View className="min-w-0 flex-1 gap-2">
        {note.text ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">Special instructions</Text>
            <Text className="text-body text-text-primary">{note.text}</Text>
          </View>
        ) : null}
        {note.agreedChange ? (
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">Agreed change</Text>
            <Text className="text-body text-text-primary">{note.agreedChange}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
