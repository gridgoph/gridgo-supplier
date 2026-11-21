import { Pressable, Text, View } from "react-native";
import { Camera, ChevronRight, KeyRound, PackageCheck, Printer, User, Zap } from "lucide-react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp, type Order } from "@/lib/api";
import { isExpressDocumentOrder } from "@/lib/expressOrder";
import type { Obligation } from "@/lib/homeBoard";
import { orderReference } from "@/lib/orderReference";
import { paymentLine, type QuickAction } from "@/lib/todo";

type Props = {
  obligation: Obligation;
  job?: Order;
  quick: QuickAction | null;
  /** Staff do the work; what a photo releases is the Owner's to read. */
  hideMoney?: boolean;
  onOpen: () => void;
  onQuick: () => void;
};

const QUICK_ICON = { Ready: PackageCheck, Code: KeyRound, Photos: Camera } as const;

/**
 * One job after the Express cards: what it is, where it stands, how the client
 * paid, and — when the next step is Ready, Code or Photos — that step as a
 * button on the row itself (gridgo-supplier#269). Tapping anywhere else opens
 * the job.
 *
 * Express and Regular are said in words beside the reference, so a regular
 * job's longer process (photos, GRIDGO's check, staged payouts) is never a
 * surprise.
 */
export function TodoRow({ obligation, job, quick, hideMoney = false, onOpen, onQuick }: Props) {
  const colors = useThemeColors();
  const late = obligation.urgency === "overdue";
  const express = isExpressDocumentOrder(job);
  const ref = orderReference(obligation.orderId);
  const paid = job ? paymentLine(job) : null;
  const detail =
    obligation.kind === "proof" && obligation.amountMinor != null && !hideMoney
      ? `${formatPhp(obligation.amountMinor)} waits on this photo`
      : obligation.detail;
  const Lead = quick?.label === "Code" ? User : Printer;

  return (
    <View className="flex-row items-center gap-3 rounded-card border border-outline bg-surface py-3 pl-3 pr-3">
      <Pressable
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityLabel={`${obligation.title}. ${obligation.status.label}. Open the job.`}
        className="gg-touch min-w-0 flex-1 flex-row items-center gap-3"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      >
        <View className="h-11 w-11 items-center justify-center rounded-field bg-surface-variant" aria-hidden>
          <Lead size={20} color={colors.textSecondary} strokeWidth={2} />
        </View>
        <View className="min-w-0 flex-1 gap-0.5">
          <View className="flex-row items-center gap-1.5">
            {express ? <Zap size={12} color={colors.info} strokeWidth={2.25} aria-hidden /> : null}
            <Text className="text-caption text-text-muted" numberOfLines={1}>
              {[express ? "Express" : "Regular", ref ? `#${ref}` : null].filter(Boolean).join("  ")}
            </Text>
          </View>
          <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
            {obligation.title}
          </Text>
          <Text className={late ? "text-caption text-error" : "text-caption text-text-muted"} numberOfLines={2}>
            {[late ? "Late" : obligation.status.label, paid].filter(Boolean).join(" · ")}
          </Text>
          {detail && obligation.kind === "proof" ? (
            <Text className="text-caption text-text-secondary" numberOfLines={2}>
              {detail}
            </Text>
          ) : null}
        </View>
        {quick ? null : <ChevronRight size={18} color={colors.textMuted} aria-hidden />}
      </Pressable>
      {quick ? (
        <Pressable
          onPress={onQuick}
          accessibilityRole="button"
          accessibilityLabel={`${quick.label}: ${obligation.title}`}
          className="gg-touch flex-row items-center gap-1.5 rounded-pill bg-accent px-4"
          style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          testID={`todo-quick-${quick.label.toLowerCase()}`}
        >
          {(() => {
            const Icon = QUICK_ICON[quick.label];
            return <Icon size={16} color={colors.accentOn} strokeWidth={2.25} />;
          })()}
          <Text className="text-button text-accent-on">{quick.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}
