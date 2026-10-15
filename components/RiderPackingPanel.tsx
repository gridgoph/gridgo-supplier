import { Check, PackageOpen } from "lucide-react-native";
import { Text, View } from "react-native";

import { useThemeColors } from "@/hooks/useTheme";
import { formatTimelineAt } from "@/lib/dates";
import { COUNTER_SEQUENCE, type RiderPacking } from "@/lib/shopHandover";

type Props = {
  counter: RiderPacking;
  /** Whose move it is, in two lines: the same words as the job's own panel. */
  title: string;
  body: string;
  /** What the rider counts per line, so the shop can count it before the rider does. */
  targets?: { key: string; name: string; expected: number }[];
};

/**
 * The counter, while a rider is there on the newer handover
 * (`lib/shopHandover.ts`): the rider checks the unpacked products, the shop
 * packs in front of the rider, the shop signs on the rider's phone.
 *
 * It is a real sequence, so it is numbered, and the step the counter is on is
 * the one yellow mark — the active step of a stepper, which the yellow rule
 * allows. Done steps are ticked; later ones stay grey. Nothing here is a
 * button: every step happens at the counter, recorded on the rider's phone.
 */
export function RiderPackingPanel({ counter, title, body, targets = [] }: Props) {
  const colors = useThemeColors();
  const current = COUNTER_SEQUENCE.findIndex((step) => step.id === counter.step);

  return (
    <View className="gg-card gap-5" testID="rider-packing">
      <View className="gap-1">
        <Text className="text-caption text-text-muted">At your counter</Text>
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          {title}
        </Text>
        <Text className="text-body text-text-secondary">{body}</Text>
      </View>

      {counter.arrivedPacked ? (
        <View className="flex-row gap-3 rounded-field bg-surface-variant p-3">
          <PackageOpen size={20} color={colors.warning} strokeWidth={2} aria-hidden />
          <Text className="min-w-0 flex-1 text-body text-text-secondary">
            The rider recorded that this job was already packed when they arrived. Unpack it for the check; it goes on
            your shop&apos;s record.
          </Text>
        </View>
      ) : null}

      <View accessibilityRole="list">
        {COUNTER_SEQUENCE.map((step, index) => {
          const done = index < current;
          const now = index === current;
          const last = index === COUNTER_SEQUENCE.length - 1;
          const when =
            step.id === "check" && counter.checkedAt
              ? `Passed ${formatTimelineAt(counter.checkedAt)}`
              : step.id === "pack" && counter.packedAt
                ? `Photographed ${formatTimelineAt(counter.packedAt)}`
                : null;
          return (
            <View
              key={step.id}
              className="flex-row gap-3"
              accessibilityLabel={`Step ${index + 1} of ${COUNTER_SEQUENCE.length}, ${step.title}. ${
                done ? "Done" : now ? "Now" : "Next"
              }.`}
            >
              <View className="items-center">
                <View
                  className={
                    done
                      ? "h-7 w-7 items-center justify-center rounded-pill bg-accent"
                      : now
                        ? "h-7 w-7 items-center justify-center rounded-pill bg-action-yellow"
                        : "h-7 w-7 items-center justify-center rounded-pill border border-outline bg-surface"
                  }
                >
                  {done ? (
                    <Check size={16} color={colors.accentOn} strokeWidth={2.5} aria-hidden />
                  ) : (
                    <Text
                      maxFontSizeMultiplier={1.2}
                      className={
                        now
                          ? "text-caption font-bold text-action-yellow-on"
                          : "text-caption font-medium text-text-muted"
                      }
                    >
                      {index + 1}
                    </Text>
                  )}
                </View>
                {last ? null : <View className="my-1 w-px flex-1 bg-outline" />}
              </View>
              <View className={last ? "min-w-0 flex-1 gap-1" : "min-w-0 flex-1 gap-1 pb-4"}>
                <View className="flex-row flex-wrap items-baseline justify-between gap-x-3">
                  <Text
                    className={
                      done || now ? "text-body font-medium text-text-primary" : "text-body text-text-secondary"
                    }
                  >
                    {step.title}
                  </Text>
                  <Text
                    className={
                      now
                        ? "text-caption font-medium text-text-primary"
                        : done
                          ? "text-caption font-medium text-success"
                          : "text-caption text-text-muted"
                    }
                  >
                    {done ? "Done" : now ? "Now" : "Next"}
                  </Text>
                </View>
                {now ? <Text className="text-body text-text-secondary">{step.detail}</Text> : null}
                {when ? <Text className="text-caption text-text-muted">{when}</Text> : null}
              </View>
            </View>
          );
        })}
      </View>

      {counter.step === "check" && targets.length ? (
        <View className="gap-2 border-t border-outline-subtle pt-4">
          <Text className="text-caption text-text-muted">Count it before the rider does</Text>
          {targets.map((target) => (
            <View key={target.key} className="flex-row items-baseline justify-between gap-3">
              <Text className="min-w-0 flex-1 text-body text-text-secondary" numberOfLines={2}>
                {target.name}
              </Text>
              <Text className="text-body-lg font-medium text-text-primary">
                {target.expected.toLocaleString("en-PH")} pcs
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}
