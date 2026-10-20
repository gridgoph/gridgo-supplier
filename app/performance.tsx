import { ChevronRight } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";

import { ErrorNotice } from "@/components/ErrorNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { usePerformance } from "@/hooks/usePerformance";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { formatDeadlineFull } from "@/lib/dates";
import { orderReference } from "@/lib/orderReference";
import {
  countRows,
  eventLine,
  eventsForOrder,
  graceLine,
  NO_MONEY_TAKEN,
  noticeView,
  onTimeLine,
  onTimeRateLabel,
  PERFORMANCE_RULES,
  topPickView,
  warningLabel,
  type Performance,
  type PerformanceEvent,
} from "@/lib/performance";

type FocusSection = "notices" | "warnings";

/**
 * How the shop is doing over the last 30 days: its Top Pick standing, its
 * on-time rate, a written notice for every job ready late, and its warnings.
 *
 * It leads with "no money is taken" because that is the first thing a shop
 * reading the word "warning" wants to know, and it is true of everything on
 * the page. A notice opened from its notification arrives with `orderId`, and
 * the page scrolls to that job's notice and marks it.
 */
export default function PerformanceScreen() {
  const colors = useThemeColors();
  const { orderId } = useLocalSearchParams<{ orderId?: string }>();
  const { read, reload } = usePerformance();
  const [titles, setTitles] = useState<Record<string, string>>({});
  const scrollRef = useRef<ScrollView>(null);
  // Where each section sits in the page, and where the focused card sits in its section.
  // Layout arrives children first, so the scroll waits until both are known.
  const sectionY = useRef<Partial<Record<FocusSection, number>>>({});
  const focus = useRef<{ section: FocusSection; y: number } | null>(null);
  const scrolled = useRef(false);

  const loadTitles = useCallback(async () => {
    try {
      const jobs = await api.listJobs();
      setTitles(Object.fromEntries(jobs.map((job) => [job.id, job.title])));
    } catch {
      // A notice without its job's title falls back to the order reference.
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void loadTitles();
    }, [loadTitles]),
  );
  const { refreshing, onRefresh } = usePullToRefresh(
    useCallback(async () => {
      await Promise.all([reload(), loadTitles()]);
    }, [reload, loadTitles]),
  );

  // A new notification for another job opens this screen again with a new `orderId`.
  useEffect(() => {
    scrolled.current = false;
    focus.current = null;
  }, [orderId]);

  const scrollToFocus = useCallback(() => {
    const target = focus.current;
    const top = target ? sectionY.current[target.section] : undefined;
    if (scrolled.current || !target || top === undefined) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, top + target.y - 16), animated: true });
  }, []);

  const placeSection = useCallback(
    (section: FocusSection, y: number) => {
      sectionY.current[section] = y;
      scrollToFocus();
    },
    [scrollToFocus],
  );
  // The notices come first; a warning is the focus only when its job has no notice.
  const placeFocus = useCallback(
    (section: FocusSection, y: number) => {
      if (section === "warnings" && focus.current?.section === "notices") return;
      focus.current = { section, y };
      scrollToFocus();
    },
    [scrollToFocus],
  );

  const performance = read?.status === "loaded" ? read.value : null;
  const focused = performance ? eventsForOrder(performance, orderId) : new Set<string>();

  return (
    <View className="gg-screen">
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="gg-page pb-12 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
        }
      >
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">How your shop is doing</Text>
          <Text className="text-body-lg text-text-secondary">
            Late jobs, warnings and your Top Pick standing over the last 30 days.
          </Text>
        </View>

        <View className="gg-panel mt-4 gap-1" testID="no-money-taken">
          <Text className="text-body font-medium text-text-primary">{NO_MONEY_TAKEN}</Text>
          <Text className="text-body text-text-secondary">
            Nothing on this page changes what your shop is paid for a job. It shows what Operations
            sees, so you can keep your shop at the front.
          </Text>
        </View>

        {!read ? (
          <View className="mt-8">
            <SkeletonList label="Loading your performance" count={3} variant="row" />
          </View>
        ) : read.status === "failed" ? (
          <View className="mt-8">
            <ErrorNotice
              message="Your performance did not load. Check the connection and try again."
              onRetry={() => void reload()}
            />
          </View>
        ) : read.status === "not_open_yet" ? (
          <Text className="mt-8 text-body text-text-muted">
            GRIDGO is not showing performance to shops on this connection yet.
          </Text>
        ) : performance ? (
          <>
            {performance.rosterReview ? <RosterReview /> : null}
            <TopPick performance={performance} />
            <OnTime performance={performance} />

            <View
              className="mt-8 gap-3"
              onLayout={(event) => placeSection("notices", event.nativeEvent.layout.y)}
            >
              <Text className="text-overline text-text-muted">LATE-FINISH NOTICES</Text>
              <Text className="text-body text-text-secondary">
                A written notice for every job ready more than an hour after its ready-by time.
              </Text>
              {performance.notices.length ? (
                performance.notices.map((notice) => (
                  <NoticeCard
                    key={notice.id}
                    notice={notice}
                    title={titles[notice.orderId]}
                    focused={focused.has(notice.id)}
                    onFocusLayout={(y) => placeFocus("notices", y)}
                  />
                ))
              ) : (
                <View className="gg-panel gap-1">
                  <Text className="text-body font-medium text-text-primary">No late finishes</Text>
                  <Text className="text-body text-text-secondary">
                    Every job so far was ready within the hour after its ready-by time.
                  </Text>
                </View>
              )}
            </View>

            <Warnings
              performance={performance}
              titles={titles}
              focused={focused}
              onSectionLayout={(y) => placeSection("warnings", y)}
              onFocusLayout={(y) => placeFocus("warnings", y)}
            />

            <Counts performance={performance} />
          </>
        ) : null}

        <View className="mt-8 gap-3">
          <Text className="text-body text-text-secondary">
            If something outside your shop is holding a job up, ask the client for a new deadline
            from the job while it is in production, or tell Operations before the ready-by time.
          </Text>
          <SecondaryButton label="Message Operations" onPress={() => router.push("/report" as Href)} />
        </View>
      </ScrollView>
    </View>
  );
}

function RosterReview() {
  return (
    <View className="gg-card mt-8 gap-2 border-warning" testID="roster-review">
      <View className="flex-row">
        <StatusChip tone="warning" icon="triangle-alert" label="Operations is reviewing your shop" />
      </View>
      <Text className="text-body text-text-secondary">
        This is a review, not a suspension. Your shop keeps getting offers while Operations looks at
        your recent jobs, and they will message you if they need anything.
      </Text>
    </View>
  );
}

function TopPick({ performance }: { performance: Performance }) {
  const view = topPickView(performance);
  return (
    <View className="mt-8 gap-3">
      <Text className="text-overline text-text-muted">TOP PICK</Text>
      <View className={`gg-card gap-2${performance.topPick.hidden ? " border-warning" : ""}`} testID="top-pick">
        <View className="flex-row">
          <StatusChip tone={view.tone} icon={view.icon} label={view.label} />
        </View>
        <Text className="text-body-lg font-medium text-text-primary">{view.title}</Text>
        <Text className="text-body text-text-secondary">{view.body}</Text>
      </View>
    </View>
  );
}

function OnTime({ performance }: { performance: Performance }) {
  const rate = onTimeRateLabel(performance);
  return (
    <View className="mt-8 gap-3">
      <Text className="text-overline text-text-muted">ON TIME</Text>
      <View className="gg-card gap-2" testID="on-time">
        {rate ? <Text className="text-display text-text-primary">{rate}</Text> : null}
        <Text className={rate ? "text-body text-text-secondary" : "text-body font-medium text-text-primary"}>
          {onTimeLine(performance)}
        </Text>
        <Text className="text-caption text-text-muted">{graceLine(performance.graceMinutes)}</Text>
      </View>
    </View>
  );
}

function orderName(orderId: string, title?: string): string {
  return title || `Order ${orderReference(orderId) ?? orderId}`;
}

function NoticeCard({
  notice,
  title,
  focused,
  onFocusLayout,
}: {
  notice: PerformanceEvent;
  title?: string;
  focused: boolean;
  onFocusLayout: (y: number) => void;
}) {
  const colors = useThemeColors();
  const view = noticeView(notice);
  const name = orderName(notice.orderId, title);
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/job/[id]", params: { id: notice.orderId } })}
      onLayout={focused ? (event) => onFocusLayout(event.nativeEvent.layout.y) : undefined}
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={`${name}. ${view.chip.label}. ${view.lateLine} Reason: ${view.reason}`}
      className={`gg-touch gg-card flex-row items-center gap-3${focused ? " border-2 border-accent" : ""}`}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
      testID={focused ? "notice-focused" : "notice"}
    >
      <View className="min-w-0 flex-1 gap-2">
        <View className="flex-row">
          <StatusChip tone={view.chip.tone} label={view.chip.label} icon={view.chip.icon} />
        </View>
        <View className="gap-0.5">
          <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
            {name}
          </Text>
          <Text className="text-caption text-text-muted">
            {view.deadlineLine ?? `Recorded ${formatDeadlineFull(notice.at)}`}
          </Text>
        </View>
        <Text className="text-body text-text-primary">{view.lateLine}</Text>
        {view.reason ? <Text className="text-body text-text-secondary">Reason: {view.reason}</Text> : null}
        {view.exemptLine ? <Text className="text-body text-text-secondary">{view.exemptLine}</Text> : null}
        {view.exemptLine ? null : <Text className="text-caption text-text-muted">Warning only — no money is taken.</Text>}
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}

function Warnings({
  performance,
  titles,
  focused,
  onSectionLayout,
  onFocusLayout,
}: {
  performance: Performance;
  titles: Record<string, string>;
  focused: Set<string>;
  onSectionLayout: (y: number) => void;
  onFocusLayout: (y: number) => void;
}) {
  // A late finish already has its notice above; the same record is not drawn twice.
  const notices = new Set(performance.notices.map((notice) => notice.id));
  const warnings = performance.warnings.filter((warning) => !notices.has(warning.id));
  return (
    <View
      className="mt-8 gap-3"
      onLayout={(event) => onSectionLayout(event.nativeEvent.layout.y)}
    >
      <Text className="text-overline text-text-muted">OTHER WARNINGS</Text>
      {warnings.length ? (
        warnings.map((warning) => {
          const isFocused = focused.has(warning.id);
          const name = orderName(warning.orderId, titles[warning.orderId]);
          return (
            <View
              key={warning.id}
              className={`gg-card gap-2${isFocused ? " border-2 border-accent" : ""}`}
              accessible
              accessibilityState={{ selected: isFocused }}
              accessibilityLabel={`${name}. ${warningLabel(warning.warningCodes[0] ?? "")}. ${eventLine(warning)}`}
              onLayout={isFocused ? (event) => onFocusLayout(event.nativeEvent.layout.y) : undefined}
              testID={isFocused ? "warning-focused" : "warning"}
            >
              <View className="flex-row">
                <StatusChip
                  tone={warning.exempt ? "neutral" : "warning"}
                  icon="triangle-alert"
                  label={warningLabel(warning.warningCodes[0] ?? "")}
                />
              </View>
              <View className="gap-0.5">
                <Text className="text-body font-medium text-text-primary" numberOfLines={2}>
                  {name}
                </Text>
                <Text className="text-caption text-text-muted">{formatDeadlineFull(warning.at)}</Text>
              </View>
              <Text className="text-body text-text-secondary">{eventLine(warning)}</Text>
              {warning.reason ? (
                <Text className="text-body text-text-secondary">Your reason: {warning.reason}</Text>
              ) : null}
            </View>
          );
        })
      ) : (
        <Text className="text-body text-text-secondary">
          No other warnings in the last {performance.windowDays} days.
        </Text>
      )}
    </View>
  );
}

function Counts({ performance }: { performance: Performance }) {
  return (
    <View className="mt-8 gap-3">
      <Text className="text-overline text-text-muted">LAST {performance.windowDays} DAYS</Text>
      <View className="gg-card gap-3" testID="counts">
        {countRows(performance.counts).map((row, index) => (
          <View key={row.key} className="gap-3">
            {index > 0 ? <View className="gg-divider" /> : null}
            <View className="flex-row items-center justify-between gap-3">
              <Text className="min-w-0 flex-1 text-body text-text-secondary">{row.label}</Text>
              <Text className="text-body-lg font-medium text-text-primary">{row.value}</Text>
            </View>
          </View>
        ))}
      </View>
      <Text className="text-overline mt-4 text-text-muted">WHAT LEADS TO WHAT</Text>
      <View className="gap-2">
        {PERFORMANCE_RULES.map((rule) => (
          <Text key={rule} className="text-body text-text-secondary">
            {rule}
          </Text>
        ))}
      </View>
      <Text className="text-body text-text-secondary">
        A job GRIDGO decides was not your shop&apos;s fault does not count toward any of these.
      </Text>
    </View>
  );
}
