import { useState } from "react";
import { Image, Text, View } from "react-native";

type Props = {
  name: string;
  imageUrl?: string | null;
  size?: number;
};

function chatInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  const first = words[0]![0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1]![0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/**
 * The person who wrote a chat line, as a circle next to the bubble.
 */
export function ChatAvatar({ name, imageUrl, size = 28 }: Props) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showing = Boolean(imageUrl && failedUrl !== imageUrl);

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={showing ? `${name}, profile photo` : `${name}`}
      className="items-center justify-center overflow-hidden border border-outline bg-surface-variant"
      style={{ width: size, height: size, borderRadius: size / 2 }}
    >
      {showing ? (
        <Image
          source={{ uri: imageUrl! }}
          resizeMode="cover"
          style={{ width: size, height: size }}
          onError={() => setFailedUrl(imageUrl ?? null)}
          accessibilityElementsHidden
        />
      ) : (
        <Text
          className="font-medium text-text-primary"
          style={{ fontSize: Math.round(size * 0.36), lineHeight: Math.round(size * 0.44) }}
        >
          {chatInitials(name)}
        </Text>
      )}
    </View>
  );
}
