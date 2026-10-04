import { ChevronRight } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";

import { ErrorNotice } from "@/components/ErrorNotice";
import { LatenessScale } from "@/components/LatenessScale";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useProductionLapses } from "@/hooks/useProductionLapses";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import {
  formatRate,
  lapseStandingLine,
  LATENESS_TIERS,
  penaltyRates,
  tierDefinition,
  type LapseTier,
  type PenaltyRates,
  type ProductionLapse,
} from "@/lib/productionLapse";

/** What each tier adds beyond its share, in the shop's words. */
const TIER_CONSEQUENCE: Record<LapseTier, string> = {
  minor: "A warning, and the minor share of what GRIDGO still owes you on the job.",
  moderate: "A formal warning on your shop's record, and the moderate share.",
  severe: "A formal warning, the severe share, and Operations may hand the job to another shop.",
};

/**
 * How late production is handled, and the shop's own late jobs.
 *
 * The page a shop reaches from the accept screen before it commits, from a
 * late job's warning, and from Account. It leads with the rule, because that
 * is what the accept-screen link promised; the shop's own record follows, so
 * the rule is read before the figures it explains.
 *
 * Rates come from GRIDGO's settings because Super Admin tunes them without a
 * release; an API that sends none gets the rule without numbers rather than
 * numbers this app made up.
 */
export default function LateProductionScreen() {
  const colors = useThemeColors();
  const { read, reload: reloadLapses } = useProductionLapses();
  const [policy, setPolicy] = useState<PenaltyRates | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});

  const loadContext = useCallback(async () => {
    const [settings, jobs] = await Promise.allSettled([api.getSettings(), api.listJobs()]);
    if (settings.status === "fulfilled") setPolicy(penaltyRates(settings.value));
    if (jobs.status === "fulfilled") {
      setTitles(Object.fromEntries(jobs.value.map((job) => [job.id, job.title])));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadContext();
    }, [loadContext]),
  );
  const { refreshing, onRefresh } = usePullToRefresh(
    useCallback(async () => {
      await Promise.all([loadContext(), reloadLapses()]);
    }, [loadContext, reloadLapses]),
  );

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-12 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
        }
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">When a job is ready late</Text>
          <Text className="text-body-lg text-text-secondary">
            Every job carries a ready-by time. If it is not ready by then, GRIDGO records it and
            tells you first, with the reason spelled out, before anything comes off your payout.
          </Text>
        </View>

        <View className="mt-8 gap-3">
          <Text className="text-overline text-text-muted">HOW IT IS MEASURED</Text>
          <Text className="text-body text-text-secondary">
            From the ready-by time on the job — the one you accepted, or the renewed one if you and
            the client agreed to move it — to the moment you mark the job ready.
          </Text>
          <View className="gg-card gap-4">
            <LatenessScale rates={policy?.rates ?? null} />
            <View className="gg-divider" />
            {LATENESS_TIERS.map((definition) => (
              <View key={definition.tier} className="gap-0.5">
                <Text className="text-body font-medium text-text-primary">
                  {definition.label}
                  {policy ? `: ${formatRate(policy.rates[definition.tier])}` : ""}
                </Text>
                <Text className="text-caption text-text-muted">{definition.range}</Text>
                <Text className="text-body text-text-secondary">
                  {TIER_CONSEQUENCE[definition.tier]}
                </Text>
              </View>
            ))}
          </View>
          {policy && !policy.deductionsEnabled ? (
            <View className="gg-panel gap-1" testID="deductions-off">
              <Text className="text-body font-medium text-text-primary">Deductions are off for now</Text>
              <Text className="text-body text-text-secondary">
                A late job still gets its warning and still counts toward your place in matching,
                but nothing comes off your payout.
              </Text>
            </View>
          ) : null}
        </View>

        <View className="mt-8 gap-3">
          <Text className="text-overline text-text-muted">WHAT A DEDUCTION TAKES</Text>
          <Text className="text-body text-text-secondary">
            A share of what GRIDGO still owes you on that one job, worked out once the job is
            ready — or as soon as it is severe. It is never more than what is still owed, it never
            touches money already sent to you, and nothing carries over to another job.
          </Text>
          <Text className="text-body text-text-secondary">
            Jobs ready late in the last 30 days also lower your place when GRIDGO matches clients
            with shops, a little for each one and only up to a limit.
          </Text>
        </View>

        <View className="mt-8 gap-3">
          <Text className="text-overline text-text-muted">YOUR LATE JOBS</Text>
          <LapseRecord read={read} titles={titles} onRetry={() => void reloadLapses()} />
        </View>

        <View className="mt-8 gap-3">
          <Text className="text-body text-text-secondary">
            If something outside your shop is holding a job up, tell Operations before the ready-by
            time. They can review the deadline with you.
          </Text>
          <SecondaryButton label="Message Operations" onPress={() => router.push("/report" as Href)} />
        </View>
      </ScrollView>
    </View>
  );
}

function LapseRecord({
  read,
  titles,
  onRetry,
}: {
  read: ReturnType<typeof useProductionLapses>["read"];
  titles: Record<string, string>;
  onRetry: () => void;
}) {
  if (!read) return <SkeletonList label="Loading your late jobs" count={2} variant="row" />;
  if (read.status === "failed") {
    return <ErrorNotice message="Your late jobs did not load. Check the connection and try again." onRetry={onRetry} />;
  }
  if (read.status === "not_open_yet") {
    return (
      <Text className="text-body text-text-muted">
        GRIDGO is not showing late-production records to shops on this connection yet.
      </Text>
    );
  }
  if (!read.lapses.length) {
    return (
      <View className="gg-panel gap-1">
        <Text className="text-body font-medium text-text-primary">No late jobs</Text>
        <Text className="text-body text-text-secondary">Every job so far was ready by its ready-by time.</Text>
      </View>
    );
  }
  return (
    <View className="gap-3">
      {read.lapses.map((lapse) => (
        <LapseRow key={lapse.id} lapse={lapse} title={titles[lapse.orderId]} />
      ))}
    </View>
  );
}

function LapseRow({ lapse, title }: { lapse: ProductionLapse; title?: string }) {
  const colors = useThemeColors();
  const definition = tierDefinition(lapse.tier);
  const closed = lapse.status === "closed";
  const formal = lapse.warnings.some((warning) => warning.formal) && !closed;
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/job/[id]", params: { id: lapse.orderId } })}
      accessibilityRole="button"
      accessibilityLabel={`${title || `Order ${lapse.orderId}`}. ${definition.label} lateness. ${lapseStandingLine(lapse)}`}
      className="gg-touch gg-card flex-row items-center gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row">
          <StatusChip tone={closed ? "neutral" : definition.tone} label={`${definition.label} lateness`} icon={definition.icon} />
        </View>
        <View className="gap-0.5">
          <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
            {title || `Order ${lapse.orderId}`}
          </Text>
          <Text className="text-caption text-text-muted">
            Ready-by {formatDeadlineFull(lapse.deadlineAt)}
          </Text>
        </View>
        <Text className="text-body text-text-secondary">{lapseStandingLine(lapse)}</Text>
        {formal ? <Text className="text-caption text-text-secondary">Formal warning on your record</Text> : null}
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}
