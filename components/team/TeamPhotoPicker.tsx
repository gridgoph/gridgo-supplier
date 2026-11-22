import { Image } from "expo-image";
import { Camera } from "lucide-react-native";
import { useEffect, useRef } from "react";
import { Pressable, Text, View } from "react-native";

import { TeamFace } from "@/components/team/TeamFace";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useThemeColors } from "@/hooks/useTheme";

/** GRIDGO's own ceiling for a team photo. */
export const TEAM_PHOTO_MAX_BYTES = 5 * 1024 * 1024;

type Props = {
  name: string;
  /** The photo GRIDGO already holds, if any. */
  photoFileId: string | null;
  /** Called once a picked photo is stored and has a `fileId` to bind. */
  onStored: (fileId: string) => void;
  /** Busy while the caller binds it. */
  disabled?: boolean;
};

/**
 * An optional face for a teammate (report F315793B).
 *
 * The picture goes up as `shop_team_photo` through the ordinary upload, and
 * the caller binds the returned id with the team route itself — never
 * `/files/:id/attach`. Optional everywhere: nothing waits on it.
 */
export function TeamPhotoPicker({ name, photoFileId, onStored, disabled = false }: Props) {
  const colors = useThemeColors();
  const upload = useFileUpload("shop_team_photo", { maxBytes: TEAM_PHOTO_MAX_BYTES });
  const latest = upload.items[upload.items.length - 1] ?? null;
  const reported = useRef<string | null>(null);

  useEffect(() => {
    if (latest?.stage === "stored" && latest.fileId && reported.current !== latest.fileId) {
      reported.current = latest.fileId;
      onStored(latest.fileId);
    }
  }, [latest, onStored]);

  const sending = latest?.stage === "uploading" || latest?.stage === "processing";
  const hasPhoto = Boolean(photoFileId) || latest?.stage === "stored";

  return (
    <View className="gap-2">
      <Pressable
        onPress={() => void upload.pickImage()}
        disabled={disabled || sending}
        accessibilityRole="button"
        accessibilityLabel={hasPhoto ? "Change the photo" : "Add a photo"}
        className="flex-row items-center gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        {latest?.uri && latest.stage !== "failed" ? (
          <Image
            source={{ uri: latest.uri }}
            contentFit="cover"
            style={{ width: 64, height: 64, borderRadius: 32 }}
            accessibilityIgnoresInvertColors
          />
        ) : photoFileId ? (
          <TeamFace name={name || "?"} photoFileId={photoFileId} size={64} />
        ) : (
          <View className="h-16 w-16 items-center justify-center rounded-pill border border-dashed border-outline bg-surface">
            <Camera size={24} color={colors.textPrimary} aria-hidden />
          </View>
        )}
        <View className="min-w-0 flex-1">
          <Text className="text-body font-bold text-text-primary">
            Photo <Text className="text-body text-text-muted">· optional</Text>
          </Text>
          <Text className="text-caption text-text-muted">
            {sending ? "Sending the photo…" : hasPhoto ? "Tap to change it" : "Helps everyone know who's who"}
          </Text>
        </View>
      </Pressable>
      {latest?.error ? (
        <Text className="text-caption text-error" accessibilityRole="alert">
          {latest.error}
        </Text>
      ) : null}
    </View>
  );
}
