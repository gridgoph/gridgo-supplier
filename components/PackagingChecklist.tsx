import { Circle, CircleCheck, Clock, OctagonAlert, ReceiptText } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { Requirement } from "@/lib/apiErrors";
import {
  otherRequirements,
  requirementTitle,
  stepRequirement,
  type PackagingCheck,
  type PackagingStepKind,
} from "@/lib/packagingReadiness";
import type { FinishedStage } from "@/lib/shopHandover";

type Props = {
  check: PackagingCheck;
  /** Where the finished photos stand with GRIDGO, on the newer handover. */
  stage?: FinishedStage | null;
  /** Opens a problem report on this job: the way out of a claim only Operations can clear. */
  onMessageOperations: () => void;
};

/**
 * What GRIDGO still needs before this job can be packaged, read before the
 * button rather than learned from a refusal (report 6C695C15).
 *
 * The photos are listed whether or not they are done, ticked or open, so a
 * shop sees the one thing left rather than a list of faults. Each open row
 * says GRIDGO's own sentence. A photo is taken from the step in the action
 * bar, so its row carries no button of its own; a claim is Operations' to
 * clear, so its row is the one place on the job to message them from.
 *
 * Status is icon, word and colour together, and nothing here is yellow — the
 * one yellow on the job is the step that fixes the first open row.
 *
 * On the newer handover (`lib/shopHandover.ts`) nothing is packed before
 * pickup, so the rows are the finished photos and GRIDGO's review instead of
 * two photos, and the card is headed by the step it leads to: calling a rider.
 */
export function PackagingChecklist({ check, stage = null, onMessageOperations }: Props) {
  const colors = useThemeColors();
  const others = otherRequirements(check);
  const done = check.steps.filter((step) => step.done).length;
  const ridersPack = check.flow === "rider_packs";
  const summary = ridersPack
    ? done === check.steps.length
      ? "GRIDGO approved your finished products."
      : `${done} of ${check.steps.length} steps done. Do not pack yet; the rider checks the unpacked items first.`
    : done === check.steps.length
      ? "Both photos are on the job."
      : `${done} of ${check.steps.length} photos on the job.`;

  return (
    <View className="gg-card gap-4" testID="packaging-checklist">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">
          {ridersPack ? "BEFORE YOU CALL A RIDER" : "BEFORE IT CAN BE PACKAGED"}
        </Text>
        <Text className="text-body text-text-secondary">
          {summary}
          {others.length ? " Something else is holding it too." : ""}
        </Text>
      </View>

      <View className="gap-4" accessibilityRole="list">
        {check.steps.map((step) => (
          <Row key={step.kind} {...stepRow(check, step.kind, stage)} colors={colors} />
        ))}
        {others.map((item, index) => (
          <BlockerRow
            key={`${item.kind}:${index}`}
            item={item}
            colors={colors}
            onMessageOperations={onMessageOperations}
          />
        ))}
        <Row
          state="optional"
          title="Receipt scan"
          detail={
            check.receiptAttached
              ? "On the job."
              : ridersPack
                ? "Not needed. It never holds up pickup."
                : "Not needed. It never holds up packing."
          }
          colors={colors}
        />
      </View>
    </View>
  );
}

/**
 * One of the shop's own steps, in words. A legacy photo row is done or needed.
 * The newer handover's review is neither while it waits on GRIDGO, and before
 * the photos go it is simply next, so it does not read as a second fault.
 */
function stepRow(
  check: PackagingCheck,
  kind: PackagingStepKind,
  stage: FinishedStage | null,
): { state: RowState; title: string; detail: string } {
  const title = requirementTitle(kind);
  const owed = stepRequirement(check, kind);
  if (kind === "finished_photos") {
    if (!owed) return { state: "done", title, detail: "Sent for GRIDGO's review." };
    if (stage?.stage === "not_sent" && stage.correction) {
      return {
        state: "needed",
        title,
        detail: stage.correction.note
          ? `GRIDGO asked for a fix: “${stage.correction.note}” Fix it, then send new photos of the unpacked products.`
          : "GRIDGO asked for a fix. Fix it, then send new photos of the unpacked products.",
      };
    }
    return { state: "needed", title, detail: owed.message };
  }
  if (kind === "review") {
    if (!owed) return { state: "done", title, detail: "Approved. You can call a rider." };
    if (stage?.stage === "in_review") {
      return {
        state: "waiting",
        title,
        detail: "GRIDGO is checking your photos. Your production time is paused until it answers. Do not pack yet.",
      };
    }
    if (stage?.stage === "with_gridgo") return { state: "blocked", title, detail: owed.message };
    return {
      state: "later",
      title,
      detail: "After you send the photos. Your production time pauses while GRIDGO reviews.",
    };
  }
  return { state: owed ? "needed" : "done", title, detail: owed ? owed.message : "On the job." };
}

type Colors = ReturnType<typeof useThemeColors>;
type RowState = "done" | "needed" | "waiting" | "later" | "blocked" | "optional";

const STATE_WORD: Record<RowState, string> = {
  done: "Done",
  needed: "Needed",
  waiting: "With GRIDGO",
  later: "Next",
  blocked: "Waiting on Operations",
  optional: "Optional",
};

function Row({
  state,
  title,
  detail,
  colors,
  children,
}: {
  state: RowState;
  title: string;
  detail: string;
  colors: Colors;
  children?: ReactNode;
}) {
  const tone =
    state === "done"
      ? colors.success
      : state === "needed"
        ? colors.warning
        : state === "waiting"
          ? colors.info
          : state === "blocked"
            ? colors.error
            : colors.textMuted;
  const Icon =
    state === "done"
      ? CircleCheck
      : state === "blocked"
        ? OctagonAlert
        : state === "optional"
          ? ReceiptText
          : state === "waiting"
            ? Clock
            : Circle;
  const quiet = state === "optional" || state === "later";
  return (
    <View
      className="flex-row gap-3"
      accessibilityLabel={`${title}, ${STATE_WORD[state]}. ${detail}`}
    >
      <View className="h-6 w-6 items-center justify-center">
        <Icon size={20} color={tone} strokeWidth={2} />
      </View>
      <View className="min-w-0 flex-1 gap-1">
        <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
          <Text
            className={quiet ? "text-body text-text-secondary" : "text-body font-medium text-text-primary"}
          >
            {title}
          </Text>
          <Text
            className={
              state === "done"
                ? "text-caption font-medium text-success"
                : state === "needed"
                  ? "text-caption font-medium text-warning"
                  : state === "waiting"
                    ? "text-caption font-medium text-info"
                    : state === "blocked"
                      ? "text-caption font-medium text-error"
                      : "text-caption text-text-muted"
            }
          >
            {STATE_WORD[state]}
          </Text>
        </View>
        <Text
          className={quiet ? "text-caption text-text-muted" : "text-body text-text-secondary"}
        >
          {detail}
        </Text>
        {children}
      </View>
    </View>
  );
}

/** A claim, a stop or a job that moved on: named, in GRIDGO's words, with the one way forward. */
function BlockerRow({
  item,
  colors,
  onMessageOperations,
}: {
  item: Requirement;
  colors: Colors;
  onMessageOperations: () => void;
}) {
  const operations = item.kind === "claim" || item.kind === "other";
  return (
    <Row state={operations ? "blocked" : "needed"} title={requirementTitle(item.kind)} detail={item.message} colors={colors}>
      {operations ? (
        <View className="pt-2">
          <SecondaryButton label="Message Operations" onPress={onMessageOperations} />
        </View>
      ) : null}
    </Row>
  );
}
