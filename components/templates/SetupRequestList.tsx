import { Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { setupRequestStatus, type SetupRequest } from "@/lib/productTemplates";

/** A shop's own template and setup requests, newest first, with where each one stands. */
export function SetupRequestList({ requests, title }: { requests: SetupRequest[]; title: string }) {
  if (!requests.length) return null;
  return (
    <View className="gap-3" testID="setup-requests">
      <Text className="text-body font-medium text-text-secondary">{title}</Text>
      {requests.map((request) => {
        const done = request.status === "completed";
        const more = request.status === "needs_revision";
        return (
          <View key={request.id} className="gg-card gap-2">
            <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
              {request.kind === "template"
                ? (request.requestedName ?? "Product request")
                : request.message ?? `Price list, ${request.fileCount} ${request.fileCount === 1 ? "file" : "files"}`}
            </Text>
            <View className="flex-row">
              <StatusChip
                tone={done ? "success" : more ? "warning" : "info"}
                icon={done ? "circle-check" : more ? "square-pen" : "clock"}
                label={setupRequestStatus(request)}
                wrap
              />
            </View>
            {request.reason && (done || more) ? (
              <Text className="text-body text-text-secondary">The GRIDGO team says: {request.reason}</Text>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
