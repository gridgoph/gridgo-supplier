import { Camera, ImageUp, RotateCcw, Trash2 } from "lucide-react-native";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import {
  evidenceStageLabel,
  type EvidenceItem,
  type StorageAvailability,
} from "@/lib/evidence";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  availability: StorageAvailability;
  items: EvidenceItem[];
  onTakePhoto: () => void;
  onPickPhoto: () => void;
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
};

/**
 * Photo evidence, with the upload told truthfully.
 *
 * Bytes moving is one state and the server finishing is another, so a photo
 * shows a real percentage while it sends, then says it is still being saved,
 * and only reads "Saved to this job" once GRIDGO has returned an id for it.
 * A failure keeps the photo on the list with a retry, never a silent drop.
 */
export function EvidenceCapture({
  availability,
  items,
  onTakePhoto,
  onPickPhoto,
  onRetry,
  onRemove,
}: Props) {
  const colors = useThemeColors();

  if (availability === "checking") {
    return (
      <View className="gg-panel flex-row items-center gap-3">
        <ActivityIndicator color={colors.textMuted} />
        <Text className="text-body text-text-secondary">
          Checking whether GRIDGO can store photos…
        </Text>
      </View>
    );
  }

  if (availability === "unavailable") {
    return (
      <View className="gg-panel gap-2">
        <View className="flex-row">
          <StatusChip
            tone="warning"
            label="Photo evidence unavailable"
            icon="triangle-alert"
          />
        </View>
        <Text className="text-body text-text-secondary">
          This GRIDGO backend cannot store files yet, so a photo would have nowhere to go. Your
          checks below are still recorded against the job, and Operations can ask for photos
          directly until file storage is switched on.
        </Text>
      </View>
    );
  }

  return (
    <View className="gap-3">
      <View className="flex-row gap-3">
        <View className="flex-1">
          <SecondaryButton label="Take photo" onPress={onTakePhoto} />
        </View>
        <View className="flex-1">
          <SecondaryButton label="Choose photo" onPress={onPickPhoto} />
        </View>
      </View>

      {items.length ? (
        <View className="gap-2">
          {items.map((item) => (
            <View
              key={item.key}
              className="gap-2 rounded-field border border-outline bg-surface p-3"
            >
              <View className="flex-row items-center gap-3">
                {item.stage === "stored" ? (
                  <ImageUp size={20} color={colors.success} strokeWidth={2} />
                ) : item.stage === "failed" ? (
                  <Camera size={20} color={colors.error} strokeWidth={2} />
                ) : (
                  <Camera size={20} color={colors.textMuted} strokeWidth={2} />
                )}
                <View className="min-w-0 flex-1">
                  <Text
                    className="text-body font-medium text-text-primary"
                    numberOfLines={1}
                  >
                    {item.fileName}
                  </Text>
                  <Text
                    className={
                      item.stage === "failed"
                        ? "text-caption text-error"
                        : item.stage === "stored"
                          ? "text-caption text-success"
                          : "text-caption text-text-muted"
                    }
                  >
                    {evidenceStageLabel(item)}
                  </Text>
                </View>
                {item.stage === "failed" ? (
                  <Pressable
                    onPress={() => onRetry(item.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Try sending ${item.fileName} again`}
                    className="gg-touch items-center justify-center px-2"
                  >
                    <RotateCcw size={20} color={colors.textPrimary} strokeWidth={2} />
                  </Pressable>
                ) : null}
                {item.stage !== "uploading" && item.stage !== "processing" ? (
                  <Pressable
                    onPress={() => onRemove(item.key)}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${item.fileName}`}
                    className="gg-touch items-center justify-center px-2"
                  >
                    <Trash2 size={20} color={colors.textMuted} strokeWidth={2} />
                  </Pressable>
                ) : null}
              </View>

              {item.stage === "uploading" ? (
                <View
                  className="h-1 w-full overflow-hidden rounded-pill bg-outline"
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: 100, now: Math.round(item.progress * 100) }}
                >
                  <View
                    className="h-1 rounded-pill bg-accent"
                    style={{ width: `${Math.max(2, Math.round(item.progress * 100))}%` }}
                  />
                </View>
              ) : null}
            </View>
          ))}
        </View>
      ) : (
        <Text className="text-caption text-text-muted">
          No photos yet. One clear shot of the finished job is usually enough.
        </Text>
      )}
    </View>
  );
}
