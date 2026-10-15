import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { WeekDayPicker } from "@/components/WeekDayPicker";
import { SelectField } from "@/components/controls/SelectField";
import {
  dayLengthLabel,
  manilaClock,
  openDaysLabel,
  timeChoices,
  timeLabel,
  validateWeekDraft,
  weekDraftChanged,
  weekDraftOf,
  type ShopHours,
  type WeekDraft,
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
 * The days the shop opens and one opening and closing time for all of them.
 *
 * GRIDGO counts production days on these hours and, for now, needs every open
 * day to be the same length — so there is one pair of times, not one per day.
 */
export function WeeklyHoursCard({ hours, now, saving, onSave }: Props) {
  const saved = weekDraftOf(hours.week);
  // Null follows what GRIDGO holds, so a newer answer replaces an untouched
  // week while an edit in progress is kept.
  const [edited, setEdited] = useState<WeekDraft | null>(null);
  const draft = edited ?? saved.draft;
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const changed = weekDraftChanged(hours.week, draft);

  function edit(patch: Partial<WeekDraft>) {
    setEdited({ ...draft, ...patch });
    setError(null);
    setDone(false);
  }

  async function pickTime(which: "opensMinute" | "closesMinute") {
    const value = await askPick({
      title: which === "opensMinute" ? "Opening time" : "Closing time",
      body: "The same time on every day you open.",
      options: timeChoices(draft[which]).map((minute) => ({ value: String(minute), label: timeLabel(minute) })),
      selected: String(draft[which]),
      cancelLabel: "Keep this time",
    });
    if (value != null) edit({ [which]: Number(value) });
  }

  async function save() {
    const problem = validateWeekDraft(draft);
    if (problem) {
      setError(problem);
      return;
    }
    const refused = await onSave(draft);
    if (refused) setError(refused);
    else {
      setEdited(null);
      setDone(true);
    }
  }

  const valid = draft.closesMinute > draft.opensMinute;

  return (
    <View className="gg-card gap-4">
      <View className="gap-1">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Weekly hours
        </Text>
        <Text className="text-body text-text-secondary">
          Tap the days you open. Every open day keeps the same hours.
        </Text>
      </View>

      <WeekDayPicker
        days={draft.days}
        onChange={(days) => edit({ days })}
        today={manilaClock(now).weekday}
        disabled={saving}
      />

      <View className="flex-row flex-wrap gap-3">
        <View className="min-w-36 flex-1">
          <SelectField
            label="Opens"
            valueLabel={timeLabel(draft.opensMinute)}
            accessibilityLabel={`Opening time, ${timeLabel(draft.opensMinute)}`}
            onPress={() => void pickTime("opensMinute")}
          />
        </View>
        <View className="min-w-36 flex-1">
          <SelectField
            label="Closes"
            valueLabel={timeLabel(draft.closesMinute)}
            accessibilityLabel={`Closing time, ${timeLabel(draft.closesMinute)}`}
            onPress={() => void pickTime("closesMinute")}
          />
        </View>
      </View>

      <Text className="text-body text-text-primary">
        {draft.days.length && valid
          ? `${openDaysLabel(draft.days)}, ${timeLabel(draft.opensMinute)} to ${timeLabel(draft.closesMinute)} — ${dayLengthLabel(draft.closesMinute - draft.opensMinute)} a day.`
          : draft.days.length
            ? "Pick a closing time later than the opening time."
            : "No open days picked yet."}
      </Text>

      {saved.uneven ? (
        <View className="gg-panel">
          <Text className="text-caption text-text-secondary">
            Your saved hours differ from day to day. Saving here gives every open day the hours above.
          </Text>
        </View>
      ) : null}

      <Text className="text-caption text-text-muted">
        A shorter day, such as a half-day Saturday, is not available yet.
      </Text>

      {error ? <ErrorNotice message={error} /> : null}
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
