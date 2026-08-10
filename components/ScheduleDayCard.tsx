import { Text, View } from "react-native";

import { JobRow } from "@/components/JobRow";
import { capacityForDay } from "@/lib/capacity";
import { dayKeyDateLabel, dayKeyLabel } from "@/lib/day";
import type { Blackout } from "@/lib/blackouts";
import { blackoutReasonLabel } from "@/lib/blackouts";
import type { ScheduleDay } from "@/lib/schedule";

type Props = {
  day: ScheduleDay;
  dailyCapacity: number | null;
  closure: Blackout | null;
  now: Date;
  onOpenJob: (jobId: string) => void;
};

/**
 * One day of the shop's week.
 *
 * The header carries the two facts a shop checks before it says yes to
 * anything: what day it is, and how much of that day is already sold. The
 * capacity figure only appears when the shop has actually set one.
 */
export function ScheduleDayCard({ day, dailyCapacity, closure, now, onOpenJob }: Props) {
  const capacity = capacityForDay(day.load, dailyCapacity);
  const relative = dayKeyLabel(day.dayKey, now);
  const absolute = dayKeyDateLabel(day.dayKey);

  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between gap-3">
        <View className="min-w-0 flex-1 flex-row items-baseline gap-2">
          <Text className="text-h3 text-text-primary">{relative}</Text>
          {relative !== absolute ? (
            <Text className="text-caption text-text-muted">{absolute}</Text>
          ) : null}
        </View>
        {capacity.capacityUnits != null ? (
          <Text
            className={
              capacity.over
                ? "text-caption font-medium text-error"
                : "text-caption text-text-muted"
            }
          >
            {capacity.committedUnits} of {capacity.capacityUnits} units
          </Text>
        ) : day.jobs.length ? (
          <Text className="text-caption text-text-muted">
            {capacity.committedUnits} unit{capacity.committedUnits === 1 ? "" : "s"}
          </Text>
        ) : null}
      </View>

      {capacity.capacityUnits != null ? (
        <View
          className="h-1 w-full overflow-hidden rounded-pill bg-outline"
          accessibilityRole="progressbar"
          accessibilityLabel={`${capacity.committedUnits} of ${capacity.capacityUnits} units committed`}
        >
          <View
            className={capacity.over ? "h-1 rounded-pill bg-error" : "h-1 rounded-pill bg-accent"}
            style={{ width: `${Math.round((capacity.fraction ?? 0) * 100)}%` }}
          />
        </View>
      ) : null}

      {closure ? (
        <View className="rounded-field border border-outline bg-surface-variant px-3 py-2">
          <Text className="text-caption text-text-secondary">
            Shop closed — {blackoutReasonLabel(closure.reason)}
            {closure.note ? ` · ${closure.note}` : ""}
          </Text>
        </View>
      ) : null}

      {day.jobs.length ? (
        <View className="gap-2">
          {day.jobs.map((job) => (
            <JobRow key={job.id} job={job} now={now} onPress={() => onOpenJob(job.id)} />
          ))}
        </View>
      ) : (
        <Text className="text-caption text-text-muted">
          {closure ? "Closed, and nothing promised." : "Nothing promised."}
        </Text>
      )}
    </View>
  );
}
