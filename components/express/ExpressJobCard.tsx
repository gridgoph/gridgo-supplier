import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { Printer, Zap } from "lucide-react-native";

import { OrderReference } from "@/components/OrderReference";
import { PrimaryButton } from "@/components/PrimaryButton";
import { StatusChip } from "@/components/StatusChip";
import { useExpressCard } from "@/hooks/useExpressCard";
import { useNow } from "@/hooks/useNow";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { acceptWindow, acceptWindowTickMs, formatCountdown } from "@/lib/acceptWindow";
import { formatDeadlineTime, shopDueAt } from "@/lib/dates";
import { expressStage, fulfilmentLine, paymentLine, settingsLine, workLine } from "@/lib/todo";

type Props = {
  job: api.Order;
  reload: () => Promise<unknown>;
  /** Staff take the job for the shop; what it pays is the Owner's. */
  staff: boolean;
};

/**
 * An Express job at the top of To do (gridgo-supplier#269).
 *
 * New: the clock, what it is, who collects it, how the client paid, what the
 * shop earns, and one big Accept — tap one. Details and "Can't do it" are
 * links, because neither is how most of these end.
 *
 * Accepted: the same card turns into Print (optional) and "It's ready" — tap
 * two. The client's code at the counter is tap three, on its own screen.
 *
 * Raised off the floor with a charcoal edge rather than painted yellow: the
 * yellow is the Accept, and a yellow card would leave it nothing to be.
 */
export function ExpressJobCard({ job, reload, staff }: Props) {
  const colors = useThemeColors();
  const stage = expressStage(job);
  const card = useExpressCard(job, reload);
  const now = useNow(acceptWindowTickMs(acceptWindow(job)));
  const window = acceptWindow(job, now);
  const offer = stage === "offer";
  const expired = card.expired || window.kind === "expired";
  const due = formatDeadlineTime(shopDueAt(job));
  const paid = paymentLine(job);
  const settings = settingsLine(job);
  const price = job.supplierPriceMinor;

  const details = () => router.push({ pathname: "/job/[id]", params: { id: job.id } });

  return (
    <View
      className="gap-4 rounded-card border-2 border-accent bg-surface-high p-4"
      testID={offer ? "express-offer-card" : "express-working-card"}
    >
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        {offer ? (
          <View className="flex-row items-center gap-1.5 rounded-pill bg-accent px-3 py-1">
            <Zap size={13} color={colors.accentOn} strokeWidth={2.25} />
            <Text className="text-caption font-medium text-accent-on">New Express job</Text>
          </View>
        ) : (
          <View className="flex-row items-center gap-2">
            <StatusChip tone="success" icon="circle-check" label="Accepted" />
            <OrderReference id={job.id} />
          </View>
        )}
        {offer && !expired && (window.kind === "running" || window.kind === "spans_closed") ? (
          <Text
            className={
              window.kind === "running" && window.closing
                ? "text-h3 text-error"
                : "text-h3 text-text-primary"
            }
            style={{ fontVariant: ["tabular-nums"] }}
            accessibilityRole="timer"
            accessibilityLabel={`${formatCountdown(window.deadlineAt.getTime() - now.getTime())} left to accept`}
            testID="express-card-clock"
          >
            {formatCountdown(window.deadlineAt.getTime() - now.getTime())} left
          </Text>
        ) : !offer && due ? (
          <Text className="text-caption text-text-muted">
            {job.fulfillmentMode === "delivery" ? "Rider at" : "Client at"} {due}
          </Text>
        ) : null}
      </View>

      <View className="flex-row items-start gap-3">
        <View className="min-w-0 flex-1 gap-1">
          <Text className="text-h2 text-text-primary" testID="express-card-work">
            {workLine(job)}
          </Text>
          {settings ? <Text className="text-body text-text-secondary">{settings}</Text> : null}
          <Text className="text-body text-text-secondary" testID="express-card-meta">
            {[fulfilmentLine(job), paid].filter(Boolean).join(" · ")}
          </Text>
        </View>
        {offer && !staff && price != null ? (
          <View className="items-end" testID="express-card-earn">
            <Text className="text-caption text-text-muted">You earn</Text>
            <Text className="text-h2 text-text-primary">{api.formatPhp(price)}</Text>
          </View>
        ) : null}
      </View>

      {offer && expired ? (
        <Text className="text-body text-text-secondary" testID="express-card-expired">
          Time&apos;s up. GRIDGO sent it to the next shop.
        </Text>
      ) : offer ? (
        <View className="gap-3">
          <PrimaryButton
            label={card.busy === "accept" ? "Accepting…" : "Accept"}
            hint="Dawata"
            disabled={card.busy != null}
            onPress={() => void card.accept()}
            testID="express-card-accept"
          />
          <View className="flex-row items-center justify-between">
            <TextLink label="Details" onPress={details} />
            <TextLink
              label="Can't do it"
              onPress={() => router.push({ pathname: "/job/[id]/decline", params: { id: job.id } })}
            />
          </View>
        </View>
      ) : (
        <View className="flex-row gap-3">
          <Pressable
            onPress={() => router.push({ pathname: "/job/[id]/print", params: { id: job.id } })}
            accessibilityRole="button"
            accessibilityLabel="Print"
            className="gg-btn-secondary h-auto min-h-14 flex-1"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <Printer size={18} color={colors.textPrimary} strokeWidth={2} />
            <Text className="text-button text-text-primary">Print</Text>
          </Pressable>
          <View className="flex-[2]">
            <PrimaryButton
              label={card.busy === "ready" ? "Saving…" : "It's ready"}
              hint="Andam na"
              disabled={card.busy != null}
              onPress={() => void card.ready()}
              testID="express-card-ready"
            />
          </View>
        </View>
      )}

      {card.error ? (
        <Text className="text-body text-error" accessibilityRole="alert">
          {card.error}
        </Text>
      ) : null}

      {!offer ? <TextLink label="Details" onPress={details} /> : null}
    </View>
  );
}

function TextLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="link"
      hitSlop={8}
      className="gg-touch justify-center"
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
    >
      <Text className="text-body font-medium text-text-primary underline">{label}</Text>
    </Pressable>
  );
}
