import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { OrderReference } from "@/components/OrderReference";
import { orderReferenceSpoken } from "@/lib/orderReference";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull } from "@/lib/dates";
import { formatPhp, type Order } from "@/lib/api";
import { presentJobStatus } from "@/lib/jobState";
import { deadlineUrgency } from "@/lib/urgency";
import { acceptWindow, acceptWindowLine } from "@/lib/acceptWindow";
import { orderSpecSummary } from "@/lib/productionSpecs";
import { shopRelease } from "@/lib/shopRecovery";
import { useNow } from "@/hooks/useNow";

type Props = {
  job: Order;
  onPress?: () => void;
  /** Optional footer (actions live on the detail screen to protect the yellow budget). */
  footer?: ReactNode;
  /** Show the agreed spec under the title. */
  showSpec?: boolean;
};

/**
 * One assigned job in a list.
 *
 * Three lines in a fixed order: what it is, when it is due, and what it takes to
 * make — with the status chip carrying icon, label and colour so the row reads
 * at a glance and in greyscale. The spec is a single dense line rather than four
 * labelled rows: a shop reads "500 × A5, 130gsm gloss" as one fact, and four
 * evenly spaced rows of the same size read as a form to fill in.
 *
 * Yellow never repeats across a list of cards — the CTA lives on the job
 * workspace.
 */
export function JobCard({ job, onPress, footer, showSpec = true }: Props) {
  const status = presentJobStatus(job);
  // Keep the answer clock separate from the production date.
  const ticking = acceptWindow(job).kind !== "none";
  const now = useNow(ticking ? 30_000 : null);
  const window = acceptWindow(job, now);
  const answerLine = acceptWindowLine(window, now);
  const dueAt = job.readyBy || job.promisedDate || job.deadline;
  // A job the shop let go is not due anywhere.
  const urgency = deadlineUrgency(shopRelease(job) ? null : dueAt, now);
  const spec = orderSpecSummary(job);
  const price = job.supplierPriceMinor != null
    ? formatPhp(job.supplierPriceMinor)
    : "Price not recorded yet";

  const content = (
    <View className="gg-card gap-3">
      <View className="flex-row items-start justify-between gap-3">
        <Text
          className="min-w-0 flex-1 text-body-lg font-medium text-text-primary"
          numberOfLines={2}
        >
          {job.title}
        </Text>
        <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
      </View>

      <View className="flex-row">
        <OrderReference id={job.id} />
      </View>

      <View className="gap-0.5">
        {answerLine ? (
          <Text
            className={
              window.kind === "expired" || (window.kind === "running" && window.closing)
                ? "text-body font-medium text-error"
                : "text-body font-medium text-warning"
            }
          >
            {answerLine}
          </Text>
        ) : null}
        <Text
          className={
            urgency.level === "overdue"
              ? "text-body font-medium text-error"
              : urgency.level === "urgent"
                ? "text-body font-medium text-warning"
                : "text-body text-text-secondary"
          }
        >
          {job.readyBy ? "Ready by " : ""}{formatDeadlineFull(dueAt)}
          {urgency.level === "undated" ? "" : ` · ${urgency.label}`}
        </Text>
        {showSpec ? (
          <Text className="text-caption text-text-muted" numberOfLines={2}>
            {spec} · {price}
          </Text>
        ) : null}
      </View>

      {footer}
    </View>
  );

  if (!onPress) return content;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${job.title}, ${orderReferenceSpoken(job.id) ?? `order ${job.id}`}, ${status.label}${
        urgency.level === "overdue" ? ", late" : ""
      }`}
      className="gg-touch"
    >
      {({ pressed }) => (
        <View className={pressed ? "opacity-90" : undefined}>{content}</View>
      )}
    </Pressable>
  );
}
