import { FileCheck, FileWarning, Paperclip, RotateCcw, Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SamplePhoto } from "@/components/SamplePhoto";
import { isProofImage, proofDocumentKind, uploadStageLabel, type UploadItem } from "@/lib/files";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  items: UploadItem[];
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
  /** Shown when nothing has been picked yet. An invitation, not a shrug. */
  emptyHint: string;
};

/**
 * Files on their way to GRIDGO, with each stage told as it is.
 *
 * Bytes moving is one state and the server finishing is another, so an item
 * shows a real percentage while it sends, then says it is still being saved,
 * and only claims to be saved once GRIDGO has returned an id for it. A failure
 * keeps the file on the list with its own reason and a retry.
 *
 * A photograph is shown as soon as the phone has one — the local URI first,
 * inside the same crop-mark frame as a listing sample. A PDF is a document
 * tile (name and type), never a broken image.
 */
export function UploadList({ items, onRetry, onRemove, emptyHint }: Props) {
  const colors = useThemeColors();

  if (!items.length) {
    return <Text className="text-caption text-text-muted">{emptyHint}</Text>;
  }

  return (
    <View className="gap-2">
      {items.map((item) => {
        const settled = item.stage === "stored" || item.stage === "attached";
        const photograph = isProofImage(item) && Boolean(item.uri);
        return (
          <View
            key={item.key}
            className="gap-2 rounded-field border border-outline bg-surface p-3"
          >
            {photograph ? (
              <SamplePhoto
                localUri={item.uri}
                fileId={item.fileId}
                altText={item.fileName}
                gutter="tight"
              />
            ) : null}
            <View className="flex-row items-center gap-3">
              {photograph ? null : settled ? (
                <FileCheck size={20} color={colors.success} strokeWidth={2} />
              ) : item.stage === "failed" ? (
                <FileWarning size={20} color={colors.error} strokeWidth={2} />
              ) : (
                <Paperclip size={20} color={colors.textMuted} strokeWidth={2} />
              )}

              <View className="min-w-0 flex-1">
                <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
                  {item.fileName}
                </Text>
                {photograph ? null : (
                  <Text className="text-caption text-text-muted">{proofDocumentKind(item)}</Text>
                )}
                <Text
                  className={
                    item.stage === "failed"
                      ? "text-caption text-error"
                      : settled
                        ? "text-caption text-success"
                        : "text-caption text-text-muted"
                  }
                >
                  {uploadStageLabel(item)}
                </Text>
              </View>

              {item.stage === "failed" && item.uri ? (
                <Pressable
                  onPress={() => onRetry(item.key)}
                  accessibilityRole="button"
                  accessibilityLabel={`Send ${item.fileName} again`}
                  className="gg-touch items-center justify-center px-2"
                >
                  <RotateCcw size={20} color={colors.textPrimary} strokeWidth={2} />
                </Pressable>
              ) : null}

              {item.stage !== "uploading" &&
              item.stage !== "processing" &&
              item.stage !== "attached" ? (
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
                accessibilityLabel={`Sending ${item.fileName}`}
                accessibilityValue={{ min: 0, max: 100, now: Math.round(item.progress * 100) }}
              >
                <View
                  className="h-1 rounded-pill bg-accent"
                  style={{ width: `${Math.max(2, Math.round(item.progress * 100))}%` }}
                />
              </View>
            ) : null}
          </View>
        );
      })}
    </View>
  );
}
