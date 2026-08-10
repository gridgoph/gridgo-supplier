import { FileCheck, FilePlus2, Trash2 } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { fileSizeText } from "@/lib/pickFile";
import type { VerificationDocument } from "@/lib/verification";
import type { PickedDocument } from "@/store/signupDraft";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  definition: VerificationDocument;
  picked: PickedDocument | undefined;
  onTakePhoto: () => void;
  onChooseFile: () => void;
  onRemove: () => void;
  /** Names what went wrong on the last attempt, and how to fix it. */
  problem?: string | null;
};

/**
 * One paper Operations asks a shop for.
 *
 * Empty and filled are genuinely different states, so they are drawn
 * differently rather than a filled slot being an empty one with text in it: an
 * empty slot offers the two ways in, a filled one names the file and offers
 * only the way out. Neither is yellow — the screen's single action is Continue.
 */
export function DocumentSlot({
  definition,
  picked,
  onTakePhoto,
  onChooseFile,
  onRemove,
  problem,
}: Props) {
  const colors = useThemeColors();

  return (
    <View className="gg-card gap-3">
      <View className="flex-row items-start gap-3">
        <View className="pt-0.5">
          {picked ? (
            <FileCheck size={20} color={colors.success} strokeWidth={2} />
          ) : (
            <FilePlus2 size={20} color={colors.textMuted} strokeWidth={2} />
          )}
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary">{definition.title}</Text>
          <Text className="text-caption text-text-muted">{definition.detail}</Text>
        </View>
        {definition.expected ? null : (
          <Text className="text-caption text-text-muted">Optional</Text>
        )}
      </View>

      {picked ? (
        <View className="flex-row items-center gap-3 rounded-field border border-outline bg-surface-variant px-3 py-2">
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-body text-text-primary" numberOfLines={1}>
              {picked.fileName}
            </Text>
            <Text className="text-caption text-text-muted">
              {[fileSizeText(picked.sizeBytes), "Sent when your account opens"]
                .filter(Boolean)
                .join(" · ")}
            </Text>
          </View>
          <Pressable
            onPress={onRemove}
            accessibilityRole="button"
            accessibilityLabel={`Remove ${definition.title}`}
            className="gg-touch items-center justify-center"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Trash2 size={20} color={colors.textMuted} strokeWidth={2} />
          </Pressable>
        </View>
      ) : (
        <View className="flex-row gap-3">
          <View className="flex-1">
            <SecondaryButton label="Take photo" onPress={onTakePhoto} />
          </View>
          <View className="flex-1">
            <SecondaryButton label="Choose file" onPress={onChooseFile} />
          </View>
        </View>
      )}

      {problem ? <Text className="text-caption text-error">{problem}</Text> : null}
    </View>
  );
}
