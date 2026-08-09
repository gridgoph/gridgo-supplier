import { Modal, Text, View } from "react-native";

import { DangerButton } from "@/components/DangerButton";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";

type Props = {
  visible: boolean;
  /** A specific question naming the thing: "Decline Grand opening tarpaulin?" */
  question: string;
  /** What will happen, in one or two sentences. */
  consequence: string;
  /** The verb that goes ahead. Matches the verb that opened this dialog. */
  confirmLabel: string;
  /** The verb that backs out. Never a bare "Cancel" for a destructive choice. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
  busy?: boolean;
};

/**
 * A deliberate confirmation.
 *
 * "Are you sure?" tells a shop nothing. This states the job by name, says what
 * the platform will do next, and labels both buttons with the outcome — so the
 * safe choice can be taken without reading the whole thing.
 */
export function ConfirmDialog({
  visible,
  question,
  consequence,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  destructive,
  busy,
}: Props) {
  const colors = useThemeColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
      accessibilityViewIsModal
    >
      <View
        className="flex-1 items-center justify-center p-4"
        style={{ backgroundColor: colors.scrim }}
      >
        <View className="w-full max-w-md gap-4 rounded-card border border-outline bg-surface p-4">
          <View className="gap-2">
            <Text className="text-h3 text-text-primary">{question}</Text>
            <Text className="text-body text-text-secondary">{consequence}</Text>
          </View>
          <View className="gap-2">
            {destructive ? (
              <DangerButton
                label={busy ? "Working…" : confirmLabel}
                disabled={busy}
                onPress={onConfirm}
              />
            ) : (
              <PrimaryButton
                label={busy ? "Working…" : confirmLabel}
                disabled={busy}
                onPress={onConfirm}
              />
            )}
            <SecondaryButton label={cancelLabel} disabled={busy} onPress={onCancel} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
