import { Pressable, Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { LatenessScale } from "@/components/LatenessScale";
import { StatusChip } from "@/components/StatusChip";
import { formatPhp } from "@/lib/money";
import type { DeductionView, LapseNotice } from "@/lib/productionLapse";

type Props = {
  notice: LapseNotice;
  /** Whether the record is still live; a closed one is drawn without the warning border. */
  closed?: boolean;
};

/** The policy screen, where every tier and the shop's own late jobs are listed. */
export const LATE_PRODUCTION_HREF = "/late-production" as Href;

/**
 * A late job, said once and plainly: the tier, how it was measured, what
 * applies, and what the shop can do now.
 *
 * Firm but calm. The border carries the tier's colour and nothing else does —
 * no filled slab, no yellow — because a late job is a fact to act on, not an
 * emergency, and the screen's one action is still the job's next step. The
 * consequences are each one sentence so none of them hides another.
 */
export function LatenessPanel({ notice, closed = false }: Props) {
  const border = closed ? "" : notice.tone === "error" ? " border-error" : " border-warning";
  return (
    <View className={`gg-card gap-4${border}`} testID="lateness-notice">
      <View className="flex-row">
        <StatusChip tone={closed ? "neutral" : notice.tone} label={notice.chipLabel} icon={notice.icon} />
      </View>
      <View className="gap-1">
        <Text className="text-body-lg font-medium text-text-primary">{notice.title}</Text>
        <Text className="text-body text-text-secondary">{notice.measured}</Text>
      </View>
      <LatenessScale current={notice.tier} />
      <View className="gg-divider" />
      <Text className="text-body text-text-secondary">{notice.penalty}</Text>
      {notice.deduction ? <DeductionLedger deduction={notice.deduction} /> : null}
      {notice.consequences.length ? (
        <View className="gap-1">
          {notice.consequences.map((line) => (
            <Text key={line} className="text-body text-text-secondary">
              {line}
            </Text>
          ))}
        </View>
      ) : null}
      <Text className="text-body font-medium text-text-primary">{notice.next}</Text>
      <Pressable
        onPress={() => router.push(LATE_PRODUCTION_HREF)}
        accessibilityRole="link"
        className="gg-touch justify-center self-start"
      >
        <Text className="text-button text-brand">How late production is handled</Text>
      </Pressable>
    </View>
  );
}

/**
 * The deduction set against what was still owed, as three lines a shop can
 * check by subtraction. The figure that came off is never larger than the one
 * above it — `lapseNotice` caps it before it gets here.
 */
export function DeductionLedger({ deduction }: { deduction: DeductionView }) {
  return (
    <View className="gap-2 rounded-field border border-outline bg-surface-variant p-3" testID="deduction-ledger">
      <LedgerRow label="Still owed on this job" amount={formatPhp(deduction.owedBeforeMinor)} />
      <LedgerRow
        label={`Late production (${deduction.rate})`}
        amount={`−${formatPhp(deduction.deductionMinor)}`}
      />
      <View className="h-px w-full bg-outline" />
      <LedgerRow label="Now to come" amount={formatPhp(deduction.owedAfterMinor)} strong />
    </View>
  );
}

function LedgerRow({ label, amount, strong = false }: { label: string; amount: string; strong?: boolean }) {
  return (
    <View className="flex-row items-baseline justify-between gap-3">
      <Text className={strong ? "min-w-0 flex-1 text-body font-medium text-text-primary" : "min-w-0 flex-1 text-body text-text-secondary"}>
        {label}
      </Text>
      <Text className={strong ? "text-body-lg font-medium text-text-primary" : "text-body text-text-primary"}>
        {amount}
      </Text>
    </View>
  );
}
