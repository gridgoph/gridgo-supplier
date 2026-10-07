import { useEffect, useState } from "react";
import { Image, Text } from "react-native";

import type { SupportChatAttachment } from "@/lib/api";
import * as api from "@/lib/api";

export function ChatPhoto({
  attachment,
  fill = false,
}: {
  attachment: SupportChatAttachment;
  fill?: boolean;
}) {
  const [result, setResult] = useState<{
    fileId: string;
    uri: string | null;
    failed: boolean;
  } | null>(null);
  const current = result?.fileId === attachment.fileId ? result : null;
  const uri = current?.uri;
  const failed = current?.failed;

  useEffect(() => {
    let cancelled = false;
    void api.getDownloadUrl(attachment.fileId)
      .then((result) => {
        if (!cancelled) setResult({ fileId: attachment.fileId, uri: result.url, failed: false });
      })
      .catch(() => {
        if (!cancelled) setResult({ fileId: attachment.fileId, uri: null, failed: true });
      });
    return () => {
      cancelled = true;
    };
  }, [attachment.fileId]);

  if (failed) {
    return (
      <Text className="text-caption text-text-muted">
        {attachment.originalFilename || "Photo could not be opened."}
      </Text>
    );
  }
  if (!uri) return <Text className="text-caption text-text-muted">Loading photo…</Text>;
  return (
    <Image
      source={{ uri }}
      accessibilityLabel={attachment.originalFilename || "Chat photo"}
      style={fill ? { width: "100%", aspectRatio: 1, borderRadius: 12 } : { width: 220, height: 220, borderRadius: 12 }}
      resizeMode="cover"
    />
  );
}
