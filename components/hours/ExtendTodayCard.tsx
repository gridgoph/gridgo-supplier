import { useState } from "react";
import { Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SelectField } from "@/components/controls/SelectField";
import {
  DISPATCH_WAITS_COPY,
  extensionPastGridgoHours,
  extensionState,
  timeLabel,
  type ShopHours,
  type WeekWindow,
} from "@/lib/shopHours";
import { askConfirm, askPick } from "@/store/sheets";

type Props = {
  hours: ShopHours;
  now: Date;
  saving: boolean;
  /** GRIDGO's own review and delivery hours, when `GET /settings` sent them. */
  operatingWeek: WeekWindow[] | null;
  /** Sets (a minute) or removes (null) today's extension; resolves to a refusal message. */
  onSave: (closesMinute: number | null) => Promise<string | null>;
};

/**
 * Staying open later, today only.
 *
 * GRIDGO's rules are said before the shop picks, not after it is refused: a
 * day the shop already opens, later than its usual close, before midnight and
 * at least 30 minutes from now. Only those times are offered.
 */
export function ExtendTodayCard({ hours, now, saving, operatingWeek, onSave }: Props) {
  const state = extensionState(hours, now);
  const [picked, setPicked] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const current = state.kind === "available" ? state.current : null;
  const choices = state.kind === "available" ? state.choices : [];
  const fallback = current && choices.includes(current.closesMinute) ? current.closesMinute : (choices[0] ?? null);
  const until = picked != null && choices.includes(picked) ? picked : fallback;
  const pastGridgo = until != null ? extensionPastGridgoHours(until, operatingWeek, now) : null;

  async function choose() {
    const value = await askPick({
      title: "Stay open until",
      body: "Today only. At least 30 minutes from now, and before midnight.",
      options: choices.map((minute) => ({ value: String(minute), label: timeLabel(minute) })),
      selected: until != null ? String(until) : null,
      cancelLabel: "Keep this time",
    });
    if (value != null) {
      setPicked(Number(value));
      setError(null);
    }
  }

  async function extend() {
    if (until == null) return;
    const refused = await onSave(until);
    setError(refused);
    if (!refused) setPicked(null);
  }

  async function remove() {
    if (!current) return;
    const confirmed = await askConfirm({
      question: `End today's extension to ${timeLabel(current.closesMinute)}?`,
      consequence:
        state.kind === "available"
          ? `Your shop closes at its usual ${timeLabel(state.normalClose)} today. Jobs you already accepted keep their dates.`
          : "Your shop goes back to its usual hours today.",
      confirmLabel: "End extension",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    setError(await onSave(null));
  }

  return (
    <View className="gg-card gap-4">
      <View className="gap-1">
        <Text className="text-h3 text-text-primary" accessibilityRole="header">
          Stay open later today
        </Text>
        <Text className="text-body text-text-secondary">
          {state.kind === "available"
            ? `You usually close at ${timeLabel(state.normalClose)}. Extend today only — tomorrow goes back to your weekly hours.`
            : "Extend a day you open, for today only."}
        </Text>
      </View>

      {state.kind === "unavailable" ? (
        <View className="gg-panel">
          <Text className="text-body text-text-secondary">{state.reason}</Text>
        </View>
      ) : null}

      {current ? (
        <View className="gg-panel-high gap-1">
          <Text className="text-body-lg font-bold text-text-primary">
            Open until {timeLabel(current.closesMinute)} today
          </Text>
          <Text className="text-caption text-text-muted">
            New jobs are timed with these extra hours. Jobs you already accepted keep their dates.
          </Text>
        </View>
      ) : null}

      {current && hours.dispatchWaits ? (
        <View className="rounded-field border border-warning bg-surface p-3">
          <Text className="text-body text-warning">{DISPATCH_WAITS_COPY}</Text>
        </View>
      ) : null}

      {state.kind === "available" && choices.length ? (
        <View className="gap-3">
          <SelectField
            label={current ? "Change to" : "Stay open until"}
            valueLabel={until != null ? timeLabel(until) : "Pick a time"}
            accessibilityLabel={`Stay open until, ${until != null ? timeLabel(until) : "no time picked"}`}
            onPress={() => void choose()}
          />
          {until != null && pastGridgo && !(current && hours.dispatchWaits) ? (
            <Text className="text-caption text-warning">{DISPATCH_WAITS_COPY}</Text>
          ) : null}
          {until != null && until !== current?.closesMinute ? (
            <SecondaryButton
              label={saving ? "Saving…" : `Extend today's hours until ${timeLabel(until)}`}
              disabled={saving}
              onPress={() => void extend()}
            />
          ) : null}
        </View>
      ) : null}

      {state.kind === "available" && !choices.length && current ? (
        <Text className="text-caption text-text-muted">
          It is too late to move it again today: a new time has to be at least 30 minutes away.
        </Text>
      ) : null}

      {current ? <SecondaryButton label="End today's extension" disabled={saving} onPress={() => void remove()} /> : null}

      {error ? <ErrorNotice message={error} /> : null}
    </View>
  );
}
