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
  const [uri, setUri] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    void api.getDownloadUrl(attachment.fileId)
      .then((result) => {
        if (!cancelled) setUri(result.url);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
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
