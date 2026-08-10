import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { ExternalLink, FileImage } from "lucide-react-native";

import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  order: api.Order;
};

/**
 * The QA-approved artwork, read-only.
 *
 * The shop needs to see exactly what the client had approved before it prints.
 * GRIDGO hands out a short-lived signed link per view, so nothing is cached
 * here and no URL is ever stored — only the file id GRIDGO gave us.
 */
export function ArtworkPanel({ order }: Props) {
  const colors = useThemeColors();
  const [files, setFiles] = useState<api.StoredFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState<string | null>(null);

  const fileIds = order.artworkFileIds ?? [];
  const key = fileIds.join(",");

  const load = useCallback(async () => {
    if (!key) return;
    setLoading(true);
    try {
      const loaded = await Promise.all(key.split(",").map((id) => api.getFile(id)));
      setFiles(loaded);
      setError(null);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("load the approved artwork")));
    } finally {
      setLoading(false);
    }
  }, [key]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(file: api.StoredFile) {
    setOpening(file.fileId);
    setError(null);
    try {
      const link = await api.getDownloadUrl(file.fileId);
      await WebBrowser.openBrowserAsync(link.url);
    } catch (e) {
      setError(humanizeApiError(e, offlineMessage("open this artwork")));
    } finally {
      setOpening(null);
    }
  }

  if (!fileIds.length) {
    return (
      <Text className="text-body text-text-secondary">
        {order.artworkName
          ? `The client's file is recorded as "${order.artworkName}", but GRIDGO has no stored copy to open. Ask Operations for the artwork before you print.`
          : "No artwork is attached to this job yet. Ask Operations for it before you print."}
      </Text>
    );
  }

  return (
    <View className="gap-2">
      {loading && !files.length ? (
        <View className="flex-row items-center gap-3">
          <ActivityIndicator color={colors.textMuted} />
          <Text className="text-body text-text-muted">Loading the approved artwork…</Text>
        </View>
      ) : null}

      {files.map((file) => (
        <Pressable
          key={file.fileId}
          onPress={() => void open(file)}
          disabled={opening === file.fileId}
          accessibilityRole="button"
          accessibilityLabel={`Open ${file.originalFilename}`}
          className="gg-touch flex-row items-center gap-3 rounded-field border border-outline bg-surface px-3 py-3"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
        >
          <FileImage size={20} color={colors.textMuted} strokeWidth={2} />
          <View className="min-w-0 flex-1">
            <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
              {file.originalFilename}
            </Text>
            <Text className="text-caption text-text-muted">
              {opening === file.fileId ? "Opening…" : describeFile(file)}
            </Text>
          </View>
          <ExternalLink size={18} color={colors.textMuted} strokeWidth={2} />
        </Pressable>
      ))}

      {error ? <Text className="text-caption text-error">{error}</Text> : null}
    </View>
  );
}

function describeFile(file: api.StoredFile): string {
  const type = file.detectedContentType.split("/")[1]?.toUpperCase() ?? "File";
  const mb = file.size / (1024 * 1024);
  const size = mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`;
  return `${type} · ${size}`;
}
