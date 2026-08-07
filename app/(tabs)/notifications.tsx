import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";

import * as api from "@/lib/api";

export default function NotificationsScreen() {
  const [items, setItems] = useState<api.Notification[]>([]);

  useFocusEffect(
    useCallback(() => {
      void api.listNotifications().then(setItems).catch(() => setItems([]));
    }, []),
  );

  return (
    <ScrollView className="flex-1 bg-canvas px-5 pt-14">
      <Text className="font-satoshi-bold text-2xl text-text-primary">Alerts</Text>
      {items.map((n) => (
        <View key={n.id} className="mt-3 rounded-2xl border border-outline bg-surface p-4">
          <Text className="font-satoshi-medium text-text-primary">{n.title}</Text>
          <Text className="mt-1 font-satoshi text-text-secondary">{n.body}</Text>
        </View>
      ))}
      {!items.length ? <Text className="mt-6 font-satoshi text-text-muted">No alerts.</Text> : null}
    </ScrollView>
  );
}
