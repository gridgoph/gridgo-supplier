import { Circle, CircleCheck, OctagonAlert, ReceiptText } from "lucide-react-native";
import type { ReactNode } from "react";
import { Text, View } from "react-native";

import { SecondaryButton } from "@/components/SecondaryButton";
import { useThemeColors } from "@/hooks/useTheme";
import type { Requirement } from "@/lib/apiErrors";
import {
  otherRequirements,
  photoRequirement,
  requirementTitle,
  type PackagingCheck,
} from "@/lib/packagingReadiness";

type Props = {
  check: PackagingCheck;
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
 */
export function PackagingChecklist({ check, onMessageOperations }: Props) {
  const colors = useThemeColors();
  const others = otherRequirements(check);
  const done = check.photos.filter((photo) => photo.done).length;

  return (
    <View className="gg-card gap-4" testID="packaging-checklist">
      <View className="gap-1">
        <Text className="text-overline text-text-muted">BEFORE IT CAN BE PACKAGED</Text>
        <Text className="text-body text-text-secondary">
          {done === check.photos.length
            ? "Both photos are on the job."
            : `${done} of ${check.photos.length} photos on the job.`}
          {others.length ? " Something else is holding it too." : ""}
        </Text>
      </View>

      <View className="gap-4" accessibilityRole="list">
        {check.photos.map((photo) => {
          const owed = photoRequirement(check, photo.kind);
          return (
            <Row
              key={photo.kind}
              state={owed ? "needed" : "done"}
              title={requirementTitle(photo.kind)}
              detail={owed ? owed.message : "On the job."}
              colors={colors}
            />
          );
        })}
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
              ? "On the job. It is optional either way."
              : "Optional. It never holds up packing."
          }
          colors={colors}
        />
      </View>
    </View>
  );
}

type Colors = ReturnType<typeof useThemeColors>;
type RowState = "done" | "needed" | "blocked" | "optional";

const STATE_WORD: Record<RowState, string> = {
  done: "Done",
  needed: "Needed",
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
        : state === "blocked"
          ? colors.error
          : colors.textMuted;
  const Icon =
    state === "done" ? CircleCheck : state === "blocked" ? OctagonAlert : state === "optional" ? ReceiptText : Circle;
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
            className={
              state === "optional"
                ? "text-body text-text-secondary"
                : "text-body font-medium text-text-primary"
            }
          >
            {title}
          </Text>
          <Text
            className={
              state === "done"
                ? "text-caption font-medium text-success"
                : state === "needed"
                  ? "text-caption font-medium text-warning"
                  : state === "blocked"
                    ? "text-caption font-medium text-error"
                    : "text-caption text-text-muted"
            }
          >
            {STATE_WORD[state]}
          </Text>
        </View>
        <Text
          className={state === "optional" ? "text-caption text-text-muted" : "text-body text-text-secondary"}
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
