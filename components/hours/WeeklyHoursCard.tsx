import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { WeekDayPicker } from "@/components/WeekDayPicker";
import { SelectField } from "@/components/controls/SelectField";
import { DayHoursRow } from "@/components/hours/DayHoursRow";
import {
  WEEKDAYS,
  changedOwnDay,
  draftDayHours,
  manilaClock,
  timeChoices,
  timeLabel,
  validateWeekDraft,
  weekDraftChanged,
  weekDraftOf,
  withOwnHours,
  type ShopHours,
  type WeekDraft,
  type WeekProblem,
} from "@/lib/shopHours";
import { askPick } from "@/store/sheets";

type Props = {
  hours: ShopHours;
  now: Date;
  saving: boolean;
  /** Saves the week; resolves to a message when GRIDGO refused it. */
  onSave: (draft: WeekDraft) => Promise<string | null>;
};

/**
 * The days the shop opens, its usual hours, and any day with its own.
 *
 * GRIDGO counts production days on the usual hours, so they are one pair of
 * times for every open day; a half-day Saturday is that day's "Different
 * hours" switch, which GRIDGO saves as an override for that weekday only.
 */
export function WeeklyHoursCard({ hours, now, saving, onSave }: Props) {
  const saved = weekDraftOf(hours.week, hours.overrides);
  // Null follows what GRIDGO holds, so a newer answer replaces an untouched
  // week while an edit in progress is kept.
  const [edited, setEdited] = useState<WeekDraft | null>(null);
  const draft = edited ?? saved.draft;
  const [error, setError] = useState<WeekProblem | null>(null);
  const [done, setDone] = useState(false);
  const changed = weekDraftChanged(hours, draft);
  const today = manilaClock(now).weekday;

  function edit(next: WeekDraft) {
    setEdited(next);
    setError(null);
    setDone(false);
  }

  async function pickTime(which: "opensMinute" | "closesMinute", weekday: number | null) {
    const day = weekday == null ? null : WEEKDAYS.find((row) => row.weekday === weekday);
    const current = day ? draftDayHours(draft, day.weekday)[which] : draft[which];
    const value = await askPick({
      title: day
        ? `${day.long} ${which === "opensMinute" ? "opens" : "closes"}`
        : which === "opensMinute"
          ? "Opening time"
          : "Closing time",
      body: day ? `${day.long} only.` : "Every open day without different hours.",
      options: timeChoices(current).map((minute) => ({ value: String(minute), label: timeLabel(minute) })),
      selected: String(current),
      cancelLabel: "Keep this time",
    });
    if (value == null) return;
    if (day) edit(withOwnHours(draft, day.weekday, { ...draftDayHours(draft, day.weekday), [which]: Number(value) }));
    else edit({ ...draft, [which]: Number(value) });
  }

  async function save() {
    const problem = validateWeekDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const refused = await onSave(draft);
    if (refused) setError({ weekday: changedOwnDay(hours, draft), message: refused });
    else {
      setEdited(null);
      setDone(true);
    }
  }

  const openDays = WEEKDAYS.filter((day) => draft.days.includes(day.weekday));

  return (
    <View className="gg-card gap-4">
      <View className="gap-1">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Weekly hours
        </Text>
        <Text className="text-body text-text-secondary">Tap the days you open.</Text>
      </View>

      <WeekDayPicker
        days={draft.days}
        onChange={(days) => edit({ ...draft, days })}
        today={today}
        disabled={saving}
      />

      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-36 flex-1">
          <SelectField
            label="Opens"
            valueLabel={timeLabel(draft.opensMinute)}
            accessibilityLabel={`Usual opening time, ${timeLabel(draft.opensMinute)}`}
            onPress={() => void pickTime("opensMinute", null)}
          />
        </View>
        <View className="min-w-36 flex-1">
          <SelectField
            label="Closes"
            valueLabel={timeLabel(draft.closesMinute)}
            accessibilityLabel={`Usual closing time, ${timeLabel(draft.closesMinute)}`}
            onPress={() => void pickTime("closesMinute", null)}
          />
        </View>
      </View>
      {error && error.weekday == null ? <ErrorNotice message={error.message} /> : null}

      {openDays.length ? (
        <View className="gap-3">
          <Text className="text-overline text-text-muted">Different hours</Text>
          {openDays.map((day) => (
            <DayHoursRow
              key={day.weekday}
              long={day.long}
              short={day.short}
              isToday={day.weekday === today}
              hours={draftDayHours(draft, day.weekday)}
              different={draft.own?.[day.weekday] != null}
              onToggle={(different) =>
                edit(withOwnHours(draft, day.weekday, different ? draftDayHours(draft, day.weekday) : null))
              }
              onPickTime={(which) => void pickTime(which, day.weekday)}
              error={error && error.weekday === day.weekday ? error.message : null}
              disabled={saving}
            />
          ))}
        </View>
      ) : null}

      {saved.uneven ? (
        <View className="gg-panel">
          <Text className="text-caption text-text-secondary">
            Some days are saved with two opening times. Saving here gives each day one.
          </Text>
        </View>
      ) : null}

      {done && !changed ? (
        <Text className="text-caption text-success">
          Weekly hours saved. New jobs are timed on them; jobs you already accepted keep their dates.
        </Text>
      ) : null}

      {changed ? (
        <View className="gap-3">
          <PrimaryButton label={saving ? "Saving…" : "Save weekly hours"} disabled={saving} onPress={() => void save()} />
          <SecondaryButton
            label="Undo changes"
            disabled={saving}
            onPress={() => {
              setEdited(null);
              setError(null);
            }}
          />
        </View>
      ) : null}
    </View>
  );
}
