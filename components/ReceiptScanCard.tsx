import { ReceiptText } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { UploadList } from "@/components/UploadList";
import { useThemeColors } from "@/hooks/useTheme";
import type { UploadItem } from "@/lib/files";

type Props = {
  /** A scan is already on the job. */
  attached: boolean;
  /** Choosing a new scan to put over the one on the job. */
  replacing: boolean;
  /** Why the step waits, in GRIDGO's words. */
  reason: string;
  /** The step the scan opens, as its button names it. */
  nextStep: string;
  /** Files picked on this visit, with their own stage, reason and retry. */
  items: UploadItem[];
  onRetry: (key: string) => void;
  onRemove: (key: string) => void;
  onReplace: () => void;
  onKeep: () => void;
  disabled?: boolean;
};

/**
 * The shop's own receipt or invoice for this order, on the handover screen,
 * when GRIDGO's Finance switch asks for it before a rider is called
 * (`lib/receiptScan.ts`). Drawn like the packing-photo card it sits beside:
 * a status chip, one plain sentence, then the picked file or a dashed space
 * for it. Taking or choosing the file is the footer's job, so the one yellow
 * on the screen stays the next thing to press.
 */
export function ReceiptScanCard({
  attached,
  replacing,
  reason,
  nextStep,
  items,
  onRetry,
  onRemove,
  onReplace,
  onKeep,
  disabled,
}: Props) {
  const colors = useThemeColors();
  const picking = !attached || replacing;
  const shown = picking
    ? items.filter((item) => item.stage !== "attached")
    : items.filter((item) => item.stage === "attached");

  return (
    <View className="gg-card gap-3" testID="receipt-scan-card">
      <View className="flex-row">
        <StatusChip
          tone={attached ? "success" : "warning"}
          label={attached ? "Receipt scan attached" : "Receipt scan needed"}
          icon={attached ? "circle-check" : "triangle-alert"}
        />
      </View>

      {attached ? (
        <Text className="text-body text-text-secondary">
          {replacing
            ? "Take or choose the new scan. Operations sees the newest one."
            : "Operations can see it now. If it is hard to read, replace it before you call a rider."}
        </Text>
      ) : (
        <>
          <Text className="text-body text-text-secondary">{reason}</Text>
          <Text className="text-caption text-text-muted">
            {nextStep} opens once the scan is attached.
          </Text>
        </>
      )}

      {shown.length ? (
        <UploadList
          items={shown}
          onRetry={onRetry}
          onRemove={onRemove}
          wording="photo"
          emptyHint=""
        />
      ) : picking ? (
        <View className="h-40 items-center justify-center gap-2 rounded-field border border-dashed border-outline bg-surface-variant px-6">
          <ReceiptText size={28} color={colors.textMuted} aria-hidden />
          <Text className="text-body font-medium text-text-primary">
            Your receipt or invoice for this order
          </Text>
          <Text className="text-center text-caption text-text-muted">
            From your own records. A clear photo or a PDF, up to 15 MB.
          </Text>
        </View>
      ) : null}

      {attached && !replacing ? (
        <SecondaryButton label="Replace scan" disabled={disabled} onPress={onReplace} />
      ) : null}
      {attached && replacing ? (
        <Pressable
          onPress={onKeep}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel="Keep the current scan"
          className="gg-touch self-start justify-center"
        >
          <Text className="text-button text-brand">Keep the current scan</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
