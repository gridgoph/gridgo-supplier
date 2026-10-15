import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SkeletonBlock } from "@/components/Skeleton";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { ClosureDatesCard } from "@/components/hours/ClosureDatesCard";
import { ExtendTodayCard } from "@/components/hours/ExtendTodayCard";
import { ShopStatusCard } from "@/components/hours/ShopStatusCard";
import { WeeklyHoursCard } from "@/components/hours/WeeklyHoursCard";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { useNow } from "@/hooks/useNow";
import * as api from "@/lib/api";
import {
  closureLabel,
  manilaClock,
  operatingWeekOf,
  validateClosure,
  weekFromDraft,
  withClosure,
  withoutClosure,
  type Closure,
  type ShopHoursPatch,
  type WeekDraft,
  type WeekWindow,
} from "@/lib/shopHours";
import { saveSchedule } from "@/store/shopSchedule";
import { useShopHours } from "@/store/shopHours";
import { useShopPlan } from "@/store/shopPlan";
import { askConfirm } from "@/store/sheets";

/**
 * When the shop is open, as GRIDGO counts it (gridgo-api `docs/SHOP_HOURS_API.md`).
 *
 * Open now or not, closing for a while, staying open later today, the weekly
 * hours and the closure dates — one screen, because they are one calendar to
 * GRIDGO: a job's hour to answer, its production time and its lateness all run
 * on it. Each section saves on its own; nothing here touches a job the shop
 * has already accepted.
 */
export default function ShopHoursScreen() {
  const hours = useShopHours((s) => s.hours);
  const status = useShopHours((s) => s.status);
  const loadError = useShopHours((s) => s.error);
  const saving = useShopHours((s) => s.saving);
  const load = useShopHours((s) => s.load);
  const save = useShopHours((s) => s.save);
  const phoneOnly = useShopPlan((s) => s.blackouts);
  const clearPhoneOnly = useShopPlan((s) => s.clearBlackouts);
  // The open/closed line and the extension's choices follow the clock.
  const now = useNow(30_000);
  const [operatingWeek, setOperatingWeek] = useState<WeekWindow[] | null>(null);
  const [closedError, setClosedError] = useState<string | null>(null);
  const [closureNotice, setClosureNotice] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  useLiveRefresh(["catalog", "settings", "identity"], () => {
    if (!useShopHours.getState().saving) return load();
  });

  useEffect(() => {
    let live = true;
    api
      .getSettings()
      .then((settings) => {
        if (live) setOperatingWeek(operatingWeekOf(settings));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  async function send(patch: ShopHoursPatch): Promise<string | null> {
    const outcome = await save(patch);
    return outcome.ok ? null : outcome.message;
  }

  async function setTemporarilyClosed(next: boolean) {
    setClosedError(null);
    if (next) {
      const confirmed = await askConfirm({
        question: "Close your shop for now?",
        consequence:
          "Clients still find your shop and listings, marked closed with no reopening date, and cannot order from you. GRIDGO sends you no new jobs until you reopen. Jobs you already accepted stay yours, on their dates.",
        confirmLabel: "Close for now",
        cancelLabel: "Stay open",
        destructive: true,
      });
      if (!confirmed) return;
    }
    setClosedError(await send({ temporarilyClosed: next }));
  }

  async function removeClosure(closure: Closure) {
    if (!hours) return;
    const confirmed = await askConfirm({
      question: `Remove the closure on ${closureLabel(closure)}?`,
      consequence: "GRIDGO will count those dates as open days again when it times new jobs.",
      confirmLabel: "Remove closure",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!confirmed) return;
    const refused = await saveSchedule({ closures: withoutClosure(hours.closures, closure) });
    setClosureNotice(refused ? { tone: "error", text: refused } : { tone: "success", text: "Closure removed." });
  }

  async function importPhoneOnly() {
    if (!hours) return;
    const today = manilaClock(new Date()).dayKey;
    let closures = hours.closures;
    let skipped = 0;
    for (const old of phoneOnly) {
      const candidate = { startDay: old.startDay, endDay: old.endDay };
      if (candidate.endDay < today || validateClosure(candidate, closures)) {
        skipped += 1;
        continue;
      }
      closures = withClosure(closures, candidate);
    }
    const added = closures.length - hours.closures.length;
    if (added) {
      const refused = await saveSchedule({ closures });
      if (refused) {
        setClosureNotice({ tone: "error", text: refused });
        return;
      }
    }
    clearPhoneOnly();
    setClosureNotice({
      tone: "success",
      text:
        `${added === 1 ? "1 closure added" : `${added} closures added`} to GRIDGO.` +
        (skipped ? ` ${skipped === 1 ? "1 was" : `${skipped} were`} past or overlapped one already saved, so left out.` : ""),
    });
  }

  async function discardPhoneOnly() {
    const confirmed = await askConfirm({
      question: "Delete the closures saved on this phone?",
      consequence: "They were never sent to GRIDGO, so nothing changes for your jobs. Closures saved with GRIDGO stay.",
      confirmLabel: "Delete from phone",
      cancelLabel: "Keep them",
      destructive: true,
    });
    if (confirmed) clearPhoneOnly();
  }

  if (!hours) {
    return (
      <View className="gg-screen">
        <ScrollView className="flex-1" contentContainerClassName="gg-page gap-4 pb-16 pt-4">
          {status === "not_open_yet" ? (
            <EmptyState
              title="Shop hours are not open yet"
              body="GRIDGO has not opened shop hours on this connection. Your jobs keep their usual timing; check again after the next update."
              actionLabel="Check again"
              onAction={() => void load()}
            />
          ) : status === "failed" ? (
            <EmptyState
              title="Shop hours are not reachable"
              body={loadError ?? "GRIDGO did not answer. Check this device's connection, then try again."}
              actionLabel="Try again"
              onAction={() => void load()}
            />
          ) : (
            <View accessibilityLabel="Loading your shop hours" className="gap-4">
              <SkeletonBlock className="h-52 w-full rounded-card" />
              <SkeletonBlock className="h-24 w-full rounded-card" />
              <SkeletonBlock className="h-72 w-full rounded-card" />
            </View>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-4 pb-16 pt-4"
        showsVerticalScrollIndicator={false}
      >
        {loadError ? <ErrorNotice message={loadError} onRetry={() => void load()} /> : null}

        <ShopStatusCard hours={hours} now={now} />

        <View className="gg-card gap-2">
          <SwitchRow
            label="Temporarily closed"
            value={hours.temporarilyClosed}
            onChange={(next) => void setTemporarilyClosed(next)}
            disabled={saving}
            hint={
              hours.temporarilyClosed
                ? "Clients see your shop as closed with no reopening date, and cannot order. Switch off to reopen on your weekly hours."
                : "For a closure with no end date yet. Clients see your shop as closed and cannot order; jobs you already accepted stay yours."
            }
          />
          {closedError ? <ErrorNotice message={closedError} /> : null}
        </View>

        <ExtendTodayCard
          hours={hours}
          now={now}
          saving={saving}
          operatingWeek={operatingWeek}
          onSave={(closesMinute) => send({ extension: closesMinute == null ? null : { closesMinute } })}
        />

        <WeeklyHoursCard
          hours={hours}
          now={now}
          saving={saving}
          onSave={(draft: WeekDraft) => saveSchedule({ week: weekFromDraft(draft) })}
        />

        <ClosureDatesCard
          closures={hours.closures}
          now={now}
          saving={saving}
          onAdd={() => router.push("/shop-closure")}
          onEdit={(closure) =>
            router.push({ pathname: "/shop-closure", params: { start: closure.startDay, end: closure.endDay } })
          }
          onRemove={(closure) => void removeClosure(closure)}
          phoneOnlyCount={phoneOnly.length}
          onImportPhoneOnly={() => void importPhoneOnly()}
          onDiscardPhoneOnly={() => void discardPhoneOnly()}
        />
        {closureNotice ? (
          closureNotice.tone === "error" ? (
            <ErrorNotice message={closureNotice.text} />
          ) : (
            <Text className="text-caption text-success">{closureNotice.text}</Text>
          )
        ) : null}

        <Text className="text-caption text-text-muted">
          Changes apply to new jobs. Jobs you already accepted keep the dates you agreed to.
        </Text>
      </ScrollView>
    </View>
  );
}
