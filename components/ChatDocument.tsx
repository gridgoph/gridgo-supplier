import * as WebBrowser from "expo-web-browser";
import { FileText } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { fileSizeText } from "@/lib/pickFile";

/**
 * A PDF in a conversation. It opens through a fresh signed link at the moment
 * it is tapped, never one held in state, because a link lives five minutes.
 */
export function ChatDocument({
  attachment,
  inverse = false,
}: {
  attachment: { fileId: string; size?: number | null };
  /** On the shop's own dark bubble. */
  inverse?: boolean;
}) {
  const colors = useThemeColors();
  const [state, setState] = useState<"idle" | "opening" | "failed">("idle");
  const ink = inverse ? colors.accentOn : colors.textPrimary;
  const size = fileSizeText(attachment.size ?? null);

  const open = async () => {
    setState("opening");
    try {
      const link = await api.getDownloadUrl(attachment.fileId);
      await WebBrowser.openBrowserAsync(link.url);
      setState("idle");
    } catch {
      setState("failed");
    }
  };

  return (
    <Pressable
      onPress={() => void open()}
      disabled={state === "opening"}
      accessibilityRole="button"
      accessibilityLabel={`Open PDF document${size ? `, ${size}` : ""}`}
      className="gg-touch flex-row items-center gap-2"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <FileText size={20} color={ink} strokeWidth={2} aria-hidden />
      <View className="min-w-0 shrink">
        <Text className="text-body font-medium" style={{ color: ink }}>
          PDF document
        </Text>
        <Text className="text-caption" style={{ color: inverse ? colors.accentOn : colors.textMuted }}>
          {state === "opening"
            ? "Opening…"
            : state === "failed"
              ? "Could not open it. Tap to try again."
              : size
                ? `${size} · Tap to open`
                : "Tap to open"}
        </Text>
      </View>
    </Pressable>
  );
}
