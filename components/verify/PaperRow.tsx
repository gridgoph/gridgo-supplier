import { Camera, FileText, IdCard, Printer, ReceiptText, RotateCcw, ScanFace } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";

import { StatusChip } from "@/components/StatusChip";
import { useThemeColors } from "@/hooks/useTheme";

export type PaperRowState =
  | { kind: "missing" }
  | { kind: "sending"; progress: number }
  | { kind: "failed"; message: string }
  | { kind: "checking"; sentAt: string | null };

/** A paper to send: a shop's (`lib/shopVerification`) or a home printer's (`lib/homePrinter`). */
export type PaperRowDefinition = { paper: string; title: string; detail: string };

const ICON: Record<string, typeof IdCard> = {
  valid_id: IdCard,
  id_selfie: ScanFace,
  business_permit: FileText,
  barangay_clearance: FileText,
  sample_work: Printer,
  tin: ReceiptText,
};

function sentLine(sentAt: string | null): string {
  if (!sentAt) return "Sent";
  const at = new Date(sentAt);
  if (Number.isNaN(at.getTime())) return "Sent";
  return `Sent ${at.toLocaleDateString("en-PH", { month: "short", day: "numeric" })}, ${at.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" })}`;
}

/**
 * One paper GRIDGO checks. Missing offers a charcoal "Add"; sending shows how
 * far the bytes are; a failure names itself and offers Try again; once
 * GRIDGO has it, the row says "Checking" — and jobs carry on meanwhile.
 */
export function PaperRow({
  definition,
  state,
  onAdd,
  onRetry,
}: {
  definition: PaperRowDefinition;
  state: PaperRowState;
  onAdd: () => void;
  onRetry: () => void;
}) {
  const colors = useThemeColors();
  const Icon = ICON[definition.paper] ?? FileText;

  return (
    <View className="gap-2 py-3" testID={`paper-${definition.paper}`}>
      <View className="flex-row items-center gap-3">
        <View className="h-11 w-11 items-center justify-center rounded-field bg-surface-variant">
          <Icon size={20} color={colors.textPrimary} strokeWidth={2} aria-hidden />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <Text className="text-body font-medium text-text-primary">{definition.title}</Text>
          <Text className="text-caption text-text-muted" numberOfLines={2}>
            {state.kind === "checking" ? sentLine(state.sentAt) : definition.detail}
          </Text>
        </View>
        {state.kind === "checking" ? (
          <StatusChip tone="info" icon="clock" label="Checking" />
        ) : state.kind === "sending" ? (
          <Text className="text-caption font-medium text-text-secondary">
            {Math.round(state.progress * 100)}%
          </Text>
        ) : state.kind === "failed" ? (
          <Pressable
            onPress={onRetry}
            accessibilityRole="button"
            accessibilityLabel={`Try again: ${definition.title}`}
            className="gg-touch flex-row items-center gap-1.5 rounded-pill border border-outline bg-surface px-4"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <RotateCcw size={16} color={colors.textPrimary} strokeWidth={2.25} aria-hidden />
            <Text className="text-button text-text-primary">Try again</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={`Add: ${definition.title}`}
            className="gg-touch flex-row items-center gap-1.5 rounded-pill bg-accent px-4"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
            testID={`paper-add-${definition.paper}`}
          >
            <Camera size={16} color={colors.accentOn} strokeWidth={2.25} aria-hidden />
            <Text className="text-button text-accent-on">Add</Text>
          </Pressable>
        )}
      </View>
      {state.kind === "sending" ? (
        <View
          className="h-1 overflow-hidden rounded-pill bg-surface-variant"
          accessibilityRole="progressbar"
          accessibilityLabel={`Sending ${definition.title}`}
          accessibilityValue={{ min: 0, max: 100, now: Math.round(state.progress * 100) }}
        >
          <View className="h-1 rounded-pill bg-accent" style={{ width: `${Math.max(4, state.progress * 100)}%` }} />
        </View>
      ) : null}
      {state.kind === "failed" ? (
        <Text className="text-caption text-error">{state.message}</Text>
      ) : null}
    </View>
  );
}
