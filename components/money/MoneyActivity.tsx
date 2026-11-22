import { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";

import { StatusChip } from "@/components/StatusChip";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { formatPhp } from "@/lib/money";
import { orderReference } from "@/lib/orderReference";
import {
  CLIENT_PAYMENT_METHODS,
  clientPaymentLine,
  HISTORY_FILTERS,
  historyAmount,
  historyLabel,
  manilaDate,
  matchesHistoryFilter,
  paymentMethodLabel,
  settlementLabel,
  whenLabel,
  type HistoryFilter,
  type MoneyPeriod,
  type ShopMoneyRead,
} from "@/lib/shopMoney";

const PERIODS = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
] as const;

/** A phone list, not an audit: the job's own screen has the rest. */
const JOBS_SHOWN = 8;
const HISTORY_SHOWN = 12;

function shortDay(day: string): string {
  return manilaDate(new Date(`${day}T12:00:00+08:00`));
}

function shortTime(iso: string): string {
  return whenLabel(iso) ?? "";
}

/**
 * The period's activity under the balances: how clients paid, what the shop
 * earned each day, each job's pay with how it was paid and any launch bonus,
 * and the history of every balance change. The Week/Month switch changes these
 * only — the balances above are all-time.
 */
export function MoneyActivity({
  read,
  period,
  onPeriod,
}: {
  read: ShopMoneyRead;
  period: MoneyPeriod;
  onPeriod: (period: MoneyPeriod) => void;
}) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const history = useMemo(
    () => read.history.filter((entry) => matchesHistoryFilter(entry, filter)),
    [read.history, filter],
  );
  const methodTotal = CLIENT_PAYMENT_METHODS.reduce(
    (sum, method) => sum + (read.paymentMethods[method] ?? 0),
    0,
  );
  const dayMax = Math.max(1, ...read.earningsByDay.map((d) => d.amountMinor));
  const periodWord = period === "week" ? "this week" : "this month";

  return (
    <View className="gap-6" testID="money-activity">
      <SegmentedControl
        options={PERIODS}
        value={period}
        onChange={onPeriod}
        accessibilityLabel="Show the last week or month"
      />

      <View className="gap-3">
        <Text className="text-h3 text-text-primary">How clients paid</Text>
        {methodTotal ? (
          <View className="gg-card gap-3" testID="client-payment-methods">
            {CLIENT_PAYMENT_METHODS.filter((m) => read.paymentMethods[m]).map((method) => {
              const count = read.paymentMethods[method] ?? 0;
              return (
                <View
                  key={method}
                  className="gap-1"
                  accessible
                  accessibilityLabel={`${paymentMethodLabel(method)}: ${count} ${count === 1 ? "job" : "jobs"}`}
                >
                  <View className="flex-row items-baseline justify-between gap-3">
                    <Text className="text-body text-text-primary">{paymentMethodLabel(method)}</Text>
                    <Text className="text-body text-text-secondary">
                      {count === 1 ? "1 job" : `${count} jobs`}
                    </Text>
                  </View>
                  <View className="h-2 overflow-hidden rounded-pill bg-surface-variant">
                    <View
                      className="h-2 rounded-pill bg-accent"
                      style={{ width: `${(count / methodTotal) * 100}%` }}
                    />
                  </View>
                </View>
              );
            })}
            <Text className="text-caption text-text-muted">
              A job paid partly by voucher counts under both.
            </Text>
          </View>
        ) : (
          <Text className="text-body text-text-muted">No jobs {periodWord} yet.</Text>
        )}
      </View>

      {read.earningsByDay.length ? (
        <View className="gap-3">
          <Text className="text-h3 text-text-primary">Earned per day</Text>
          <View className="gg-card gap-2" testID="earned-per-day">
            {read.earningsByDay
              .slice(-7)
              .reverse()
              .map(({ day, amountMinor }) => (
                <View
                  key={day}
                  className="flex-row items-center gap-3"
                  accessible
                  accessibilityLabel={`${shortDay(day)}: ${formatPhp(amountMinor)}`}
                >
                  <Text className="w-24 text-caption text-text-muted">{shortDay(day)}</Text>
                  <View className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-surface-variant">
                    <View
                      className="h-2 rounded-pill bg-accent"
                      style={{ width: `${(Math.max(0, amountMinor) / dayMax) * 100}%` }}
                    />
                  </View>
                  <Text
                    className="w-24 text-right text-body text-text-primary"
                    style={{ fontVariant: ["tabular-nums"] }}
                  >
                    {formatPhp(amountMinor)}
                  </Text>
                </View>
              ))}
            {read.earningsByDay.length > 7 ? (
              <Text className="text-caption text-text-muted">The last 7 days with earnings.</Text>
            ) : null}
          </View>
        </View>
      ) : null}

      {read.jobs.length ? (
        <View className="gap-3">
          <Text className="text-h3 text-text-primary">Pay by job</Text>
          <View className="gg-card gap-3" testID="pay-by-job">
            {read.jobs.slice(0, JOBS_SHOWN).map((job, index) => {
              const paid = clientPaymentLine(job.clientPayment);
              const tag = settlementLabel(job.clientPayment);
              const bonus = job.bonus && job.bonus.amountMinor > 0 ? job.bonus.amountMinor : 0;
              return (
                <View key={job.orderId}>
                  {index > 0 ? <View className="gg-divider mb-3" /> : null}
                  <Pressable
                    onPress={() =>
                      router.push({ pathname: "/job/[id]", params: { id: job.orderId } })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open job ${orderReference(job.orderId) ?? ""}`}
                    className="gg-touch gap-1"
                    style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                    testID={`money-job-${job.orderId}`}
                  >
                    <View className="flex-row items-baseline justify-between gap-3">
                      <Text className="min-w-0 flex-1 text-body font-medium text-text-primary">
                        {orderReference(job.orderId) ?? "Job"} · {shortTime(job.createdAt)}
                      </Text>
                      {job.shopPayMinor != null ? (
                        <Text
                          className="text-body font-medium text-text-primary"
                          style={{ fontVariant: ["tabular-nums"] }}
                        >
                          {formatPhp(job.shopPayMinor)}
                        </Text>
                      ) : null}
                    </View>
                    <View className="flex-row flex-wrap items-center justify-between gap-2">
                      <Text className="min-w-0 flex-1 text-caption text-text-muted">
                        {paid ?? "Payment method not recorded"}
                      </Text>
                      {bonus ? (
                        <Text className="text-caption font-medium text-success">
                          +{formatPhp(bonus)} launch bonus
                        </Text>
                      ) : null}
                    </View>
                    {tag ? (
                      <View className="flex-row">
                        <StatusChip
                          tone="neutral"
                          icon={job.clientPayment.settlement === "daily" ? "zap" : "clock"}
                          label={tag}
                        />
                      </View>
                    ) : null}
                  </Pressable>
                </View>
              );
            })}
          </View>
          {read.jobs.length > JOBS_SHOWN ? (
            <Text className="text-caption text-text-muted">
              The {JOBS_SHOWN} newest of {read.jobs.length} jobs {periodWord}.
            </Text>
          ) : null}
        </View>
      ) : null}

      <View className="gap-3">
        <Text className="text-h3 text-text-primary">History</Text>
        <SegmentedControl
          options={HISTORY_FILTERS}
          value={filter}
          onChange={setFilter}
          accessibilityLabel="Filter the history"
        />
        {history.length ? (
          <View className="gg-card gap-3" testID="money-history">
            {history.slice(0, HISTORY_SHOWN).map((entry, index) => {
              const amount = historyAmount(entry);
              const ref = orderReference(entry.orderId);
              return (
                <View key={entry.id}>
                  {index > 0 ? <View className="gg-divider mb-3" /> : null}
                  <View className="flex-row items-baseline justify-between gap-3">
                    <View className="min-w-0 flex-1 gap-0.5">
                      <Text className="text-body text-text-primary">{historyLabel(entry)}</Text>
                      <Text className="text-caption text-text-muted">
                        {[ref, shortTime(entry.at), entry.reference ? `ref ${entry.reference}` : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <Text
                      className={
                        amount.tone === "owed"
                          ? "text-body font-medium text-success"
                          : amount.tone === "owing"
                            ? "text-body font-medium text-error"
                            : "text-body font-medium text-text-primary"
                      }
                      style={{ fontVariant: ["tabular-nums"] }}
                    >
                      {amount.text}
                    </Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text className="text-body text-text-muted">Nothing here {periodWord}.</Text>
        )}
      </View>
    </View>
  );
}
