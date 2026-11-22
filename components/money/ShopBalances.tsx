import { CirclePause, Clock } from "lucide-react-native";
import { Text, View } from "react-native";
import { router, type Href } from "expo-router";

import { PrimaryButton } from "@/components/PrimaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp } from "@/lib/money";
import {
  netLine,
  nextPayoutLine,
  payGridgoNotice,
  type PayGridgo,
  type ShopMoneyBalances,
  type ShopMoneySchedule,
} from "@/lib/shopMoney";

/**
 * The shop's two balances with GRIDGO, read like a cash book: what GRIDGO owes
 * the shop, what the shop owes GRIDGO, a rule, and the net underneath — then
 * when the next payout runs.
 *
 * Pay GRIDGO is the one yellow on Money, and only while a request is open; a
 * shop that owes nothing has no action here. A paused shop hears it first,
 * above the figures, in the error tone with an icon and a label, so it reads
 * in greyscale.
 */
export function ShopBalances({
  balances,
  schedule,
  payGridgo,
  now = new Date(),
}: {
  balances: ShopMoneyBalances;
  schedule: ShopMoneySchedule | null;
  payGridgo: PayGridgo | null;
  now?: Date;
}) {
  const colors = useThemeColors();
  const net = netLine(balances);
  const next = nextPayoutLine(balances, schedule, now);
  const notice = payGridgo ? payGridgoNotice(payGridgo, balances, now) : null;
  const netColor =
    net.tone === "owed"
      ? "text-success"
      : net.tone === "owing"
        ? "text-error"
        : "text-text-primary";

  return (
    <View className="gg-card gap-4" testID="shop-balances">
      {notice ? (
        <View
          className={
            notice.tone === "error"
              ? "flex-row items-start gap-3 rounded-field border border-error p-3"
              : "flex-row items-start gap-3 rounded-field border border-warning p-3"
          }
          accessibilityRole="alert"
          testID={notice.tone === "error" ? "pay-gridgo-paused" : "pay-gridgo-due"}
        >
          <View className="pt-0.5">
            {notice.tone === "error" ? (
              <CirclePause size={20} color={colors.error} strokeWidth={2} aria-hidden />
            ) : (
              <Clock size={20} color={colors.warning} strokeWidth={2} aria-hidden />
            )}
          </View>
          <View className="min-w-0 flex-1 gap-1">
            <Text className="text-body font-bold text-text-primary">{notice.title}</Text>
            <Text className="text-body text-text-secondary">{notice.body}</Text>
          </View>
        </View>
      ) : null}

      <View className="gap-3">
        <BalanceRow
          label="GRIDGO owes you"
          hint="Your shop pay, earned and not yet sent"
          amountMinor={balances.owedMinor}
          testID="balance-owed"
        />
        <BalanceRow
          label="You owe GRIDGO"
          hint={
            balances.owingMinor > 0
              ? "GRIDGO's share of money you collected"
              : "Only if you collect money yourself"
          }
          amountMinor={balances.owingMinor}
          testID="balance-owing"
        />
      </View>

      <View className="h-0.5 bg-accent" />

      <View
        className="flex-row items-baseline justify-between gap-3"
        accessible
        accessibilityLabel={`${net.label}: ${formatPhp(Math.abs(balances.netMinor))}`}
        testID="balance-net"
      >
        <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary">
          {net.label}
        </Text>
        <Text className={`text-h1 ${netColor}`} style={{ fontVariant: ["tabular-nums"] }}>
          {formatPhp(Math.abs(balances.netMinor))}
        </Text>
      </View>

      {next ? (
        <Text className="text-caption text-text-muted" testID="next-payout">
          {next}
        </Text>
      ) : null}

      {notice ? (
        <PrimaryButton
          label={notice.action}
          onPress={() => router.push("/pay-gridgo" as Href)}
          testID="pay-gridgo-open"
        />
      ) : null}
    </View>
  );
}

function BalanceRow({
  label,
  hint,
  amountMinor,
  testID,
}: {
  label: string;
  hint: string;
  amountMinor: number;
  testID: string;
}) {
  return (
    <View className="flex-row items-baseline justify-between gap-3" testID={testID}>
      <View className="min-w-0 flex-1 gap-0.5">
        <Text className="text-body text-text-primary">{label}</Text>
        <Text className="text-caption text-text-muted">{hint}</Text>
      </View>
      <Text
        className="text-body-lg font-medium text-text-primary"
        style={{ fontVariant: ["tabular-nums"] }}
      >
        {formatPhp(amountMinor)}
      </Text>
    </View>
  );
}
