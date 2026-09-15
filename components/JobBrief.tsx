import { ChevronDown } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { FadeIn, LinearTransition, useReducedMotion } from "react-native-reanimated";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import { JobTimeline } from "@/components/JobTimeline";
import { MilestoneList } from "@/components/MilestoneList";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { motion } from "@/constants/theme";
import { useThemeColors } from "@/hooks/useTheme";
import { formatPhp, type Order } from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import { custodyForOrder } from "@/lib/handoff";
import { earningsSplit, milestoneViews } from "@/lib/milestones";
import { unreleasedMinor } from "@/lib/payout";
import {
  DEFAULT_BRIEF_SECTIONS,
  distanceLabel,
  jobBriefSections,
  type JobBriefSectionId,
} from "@/lib/jobBrief";
import { orderProductionItems, productionSpecRows } from "@/lib/productionSpecs";

type Props = {
  order: Order;
  /** Which rows to draw, in order. The default is the offer as a shop weighs it. */
  sections?: JobBriefSectionId[];
  /** The row that starts open. `null` starts the docket fully folded. */
  defaultOpen?: JobBriefSectionId | null;
  /** Bumped by pull-to-refresh so filed proof photographs are asked for again. */
  proofReloadVersion?: number;
};

/**
 * The job docket: the whole offer as a stack of rows, each stating its own
 * facts while closed and opening on its own to show the detail.
 *
 * One row is open at a time. That is what keeps the screen short — the
 * artwork, the reference picture and the specification each want a screen of
 * their own, and stacked flat they pushed the decision three screens down.
 * Folded, every row still reads: the count of print files, the date the shop
 * is held to, the price. A shop that opens nothing has still read the offer.
 *
 * The rows are not numbered. Nothing here is a sequence — a shop reads the
 * artwork before the price or after it, as it likes.
 *
 * Opening is the one motion: the docket re-lays itself over the standard
 * transition and the detail fades in. With reduced motion on, the row simply
 * appears. The chevron says which row is open; it turns, but the open state is
 * also carried by the detail being there and by `accessibilityState`.
 */
export function JobBrief({
  order,
  sections = DEFAULT_BRIEF_SECTIONS,
  defaultOpen = "make",
  proofReloadVersion = 0,
}: Props) {
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const rows = jobBriefSections(order, sections);
  const [open, setOpen] = useState<JobBriefSectionId | null>(() =>
    rows.some((row) => row.id === defaultOpen && !row.empty) ? defaultOpen : null,
  );

  const layout = reduceMotion ? undefined : LinearTransition.duration(motion.base);
  const entering = reduceMotion ? undefined : FadeIn.duration(motion.fast);

  return (
    <Animated.View layout={layout} className="gg-card-flush" testID="job-brief">
      {rows.map((row, index) => {
        const expanded = open === row.id;
        return (
          <View key={row.id} className={index === 0 ? undefined : "border-t border-outline-subtle"}>
            <Pressable
              onPress={() => setOpen(expanded ? null : row.id)}
              disabled={row.empty}
              accessibilityRole="button"
              accessibilityState={{ expanded, disabled: Boolean(row.empty) }}
              accessibilityLabel={`${row.title}, ${row.summary}`}
              accessibilityHint={row.empty ? undefined : expanded ? "Closes this part" : "Opens this part"}
              className="gg-touch flex-row items-center gap-3 px-4 py-3"
            >
              {({ pressed }) => (
                <>
                  <View className="min-w-0 flex-1 gap-0.5">
                    <Text className="text-body font-medium text-text-primary">{row.title}</Text>
                    <Text
                      numberOfLines={1}
                      className={row.empty ? "text-body text-text-muted" : "text-body text-text-secondary"}
                    >
                      {row.summary}
                    </Text>
                  </View>
                  {row.empty ? null : (
                    // Turning the chevron is a runtime transform, which is on the
                    // style exception list; the class list stays static.
                    <View style={{ transform: [{ rotate: expanded ? "180deg" : "0deg" }] }}>
                      <ChevronDown size={18} color={colors.textMuted} strokeWidth={2} />
                    </View>
                  )}
                  {pressed ? <View className="gg-pressed absolute inset-0" /> : null}
                </>
              )}
            </Pressable>

            {expanded ? (
              <Animated.View entering={entering} className="px-4 pb-4" testID={`job-brief-${row.id}`}>
                <SectionBody id={row.id} order={order} proofReloadVersion={proofReloadVersion} />
              </Animated.View>
            ) : null}
          </View>
        );
      })}
    </Animated.View>
  );
}

/** The detail behind one row. Each body is the same component the workspace already draws. */
function SectionBody({
  id,
  order,
  proofReloadVersion,
}: {
  id: JobBriefSectionId;
  order: Order;
  proofReloadVersion: number;
}) {
  switch (id) {
    case "make": {
      const items = orderProductionItems(order);
      return (
        <View className="gap-3">
          {items.map((item) => (
            <View key={item.id}>
              {items.length > 1 ? (
                <Text className="pt-1 text-body font-medium text-text-primary">{item.itemName}</Text>
              ) : null}
              {productionSpecRows(item).map((spec, index) => (
                <SpecRow key={`${spec.label}:${index}`} label={spec.label} value={spec.value} />
              ))}
            </View>
          ))}
        </View>
      );
    }
    case "artwork":
      return (
        <View className="gap-2">
          <Text className="text-caption text-text-muted">
            The files you print from, as the client approved them. Open one to check it at full size.
          </Text>
          <ArtworkPanel order={order} kinds={["artwork"]} />
        </View>
      );
    case "mockup":
      return (
        <View className="gap-2">
          <Text className="text-caption text-text-muted">
            The client&apos;s picture of the finished piece. A visual mockup, not a print-ready proof.
          </Text>
          <ArtworkPanel order={order} kinds={["mockup"]} />
        </View>
      );
    case "delivery": {
      const distance = distanceLabel(order.deliveryDistanceMeters);
      return (
        <View>
          {order.readyBy ? (
            <SpecRow label="Have it ready by" value={formatDeadlineFull(order.readyBy)} />
          ) : (
            <SpecRow label="Client needs it by" value={formatDeadlineFull(order.promisedDate || order.deadline)} />
          )}
          <SpecRow label="Deliver to" value={order.address || "—"} />
          {distance ? <SpecRow label="Distance" value={distance} /> : null}
          <Text className="pt-3 text-caption text-text-muted">
            A GRIDGO rider collects it from your counter. You do not deliver it yourself.
          </Text>
        </View>
      );
    }
    case "earnings": {
      /*
        Once GRIDGO has split the price into its four parts, the row is about
        where each part has got to. The amounts are the shop's own earnings —
        the client's total, the delivery fee and GRIDGO's commission are
        somebody else's money and none of them belong on a supplier's screen.
      */
      const milestones = milestoneViews(order);
      if (milestones.length) {
        const split = earningsSplit(order);
        return (
          <View className="gap-4">
            <View className="flex-row items-end justify-between gap-3">
              <View className="min-w-0 flex-1 gap-0.5">
                <Text className="text-caption text-text-muted">
                  {split.releasedMinor > 0 ? "Released so far" : "Still to come"}
                </Text>
                <Text className="text-h2 text-text-primary">
                  {formatPhp(split.releasedMinor > 0 ? split.releasedMinor : unreleasedMinor(split))}
                </Text>
              </View>
              <Text className="text-caption text-text-muted">of {formatPhp(split.totalMinor)}</Text>
            </View>
            <View className="gg-divider" />
            <MilestoneList milestones={milestones} showDetail proofReloadVersion={proofReloadVersion} />
          </View>
        );
      }
      return (
        <View className="gap-3">
          <View className="gap-0.5">
            <Text className="text-caption text-text-muted">Your price, from your own board</Text>
            <Text className="text-h2 text-text-primary">
              {order.supplierPriceMinor != null ? formatPhp(order.supplierPriceMinor) : "—"}
            </Text>
          </View>
          <Text className="text-body text-text-secondary">
            GRIDGO&apos;s charge and the delivery fee sit on top of this to reach what the client
            paid — neither comes out of it.
          </Text>
          <View className="gap-1">
            <Text className="text-body font-medium text-text-primary">How it reaches you</Text>
            <Text className="text-body text-text-secondary">
              In four parts as the job moves — printing, packaging, delivery, and a retention part
              that lands once the client&apos;s window to report a problem closes. Each needs
              evidence before it is released, and you file the first two here.
            </Text>
          </View>
        </View>
      );
    }
    case "handoff": {
      const custody = custodyForOrder(order);
      return (
        <View className="gap-2">
          <View className="flex-row">
            <StatusChip tone={custody.tone} label={custody.label} icon={custody.icon} />
          </View>
          <Text className="text-body text-text-secondary">{custody.detail}</Text>
        </View>
      );
    }
    case "history":
      return <JobTimeline timeline={order.timeline} />;
  }
}
