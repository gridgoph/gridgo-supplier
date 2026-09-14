import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";

import { ArtworkPanel } from "@/components/ArtworkPanel";
import { EmptyState } from "@/components/EmptyState";
import { JobTimeline } from "@/components/JobTimeline";
import { JourneyTrack } from "@/components/JourneyTrack";
import { MilestoneList } from "@/components/MilestoneList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SkeletonBlock } from "@/components/Skeleton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull } from "@/lib/dates";
import * as api from "@/lib/api";
import { custodyForOrder } from "@/lib/handoff";
import { actionsForJob, presentOrderState, routeForAction, waitingOn } from "@/lib/jobState";
import { earningsSplit, milestoneViews } from "@/lib/milestones";
import { unreleasedMinor } from "@/lib/payout";
import { deadlineUrgency } from "@/lib/urgency";
import { useViewing } from "@/store/toasts";
import { useJob } from "@/hooks/useJob";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The job workspace: what was agreed, where the job stands, what happened, and
 * the one step the shop can take next. Every step opens its own screen.
 */
export default function JobWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const colors = useThemeColors();
  const { job, loading, error, reload } = useJob(id);
  const [proofReloadVersion, setProofReloadVersion] = useState(0);
  const { refreshing, onRefresh } = usePullToRefresh(useCallback(async () => {
    await reload();
    setProofReloadVersion((version) => version + 1);
  }, [reload]));

  // Coming back from a flow screen must show the state the flow produced.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  /*
    Declare which job is on screen, so a live alert about this one does not
    interrupt with news the shop is already reading. Alerts about other jobs
    still toast.
  */
  useFocusEffect(
    useCallback(() => {
      useViewing.getState().setOrder(id ?? null);
      return () => useViewing.getState().setOrder(null);
    }, [id]),
  );

  useEffect(() => {
    if (job) navigation.setOptions({ title: job.title });
  }, [job, navigation]);

  if (loading && !job) {
    return (
      <View
        className="gg-screen gg-page pt-4"
        accessibilityRole="progressbar"
        accessibilityLabel="Opening this job"
      >
        <View className="gap-3">
          <SkeletonBlock className="h-6 w-32 rounded-pill" />
          <SkeletonBlock className="h-8 w-3/4" />
          <SkeletonBlock className="h-5 w-1/2" />
        </View>
        <View className="mt-8 gap-2">
          <SkeletonBlock className="h-3 w-28" />
          <SkeletonBlock className="h-1 w-full rounded-pill" />
        </View>
        <View className="mt-8 gap-4">
          <SkeletonBlock className="h-40 w-full rounded-card" />
          <SkeletonBlock className="h-24 w-full rounded-card" />
        </View>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="This job is not reachable"
          body={error || "It is no longer on your floor. GRIDGO may have rematched it."}
          actionLabel="Try again"
          onAction={() => void reload()}
          secondaryLabel="Back to jobs"
          onSecondary={() => router.navigate("/(tabs)/jobs")}
        />
      </View>
    );
  }

  const status = presentOrderState(job.state);
  const actions = actionsForJob(job);
  const primary = actions.find((a) => a.primary) ?? null;
  const secondary = actions.filter((a) => !a.primary);
  const urgency = deadlineUrgency(job.promisedDate || job.deadline);
  const milestones = milestoneViews(job);
  const split = earningsSplit(job);
  const custody = custodyForOrder(job);
  const showCustody = ["ready", "rider_assigned", "with_rider"].includes(custody.state);
  const waiting = waitingOn(job.state);

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.textMuted}
          />
        }
      >
        {/*
          This header does not animate, deliberately. It used to enter from
          below on a state change — the only content in the app that arrived
          from the bottom, and keyed so that merely opening a job ran it too.
          The chip and the journey track already say the state in words, so the
          motion carried nothing the screen does not state. Do not put it back.
        */}
        <View className="gap-3">
          <View className="flex-row">
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          </View>
          <Text className="text-h1 text-text-primary">{job.title}</Text>
          <Text className="text-caption text-text-muted">Order {job.id}</Text>
          <Text className="text-body-lg text-text-secondary">
            {job.promisedDate ? "Promised" : "Client needs it by"}{" "}
            {formatDeadlineFull(job.promisedDate || job.deadline)}
          </Text>
          {urgency.level !== "undated" ? (
            <Text
              className={
                urgency.level === "overdue"
                  ? "text-body font-medium text-error"
                  : urgency.level === "urgent"
                    ? "text-body font-medium text-warning"
                    : "text-body text-text-muted"
              }
            >
              {urgency.label}
            </Text>
          ) : null}
        </View>

        <View className="mt-6">
          <JourneyTrack state={job.state} />
        </View>

        <View className="gg-card mt-6">
          <Text className="mb-2 text-overline text-text-muted">APPROVED SPEC</Text>
          <SpecRow label="Size" value={job.size || "—"} />
          <SpecRow label="Material" value={job.material || "—"} />
          <SpecRow label="Quantity" value={`${job.quantity}`} />
          {job.supplierPriceMinor != null ? (
            <SpecRow label="Your price" value={api.formatPhp(job.supplierPriceMinor)} />
          ) : null}
          <SpecRow label="Deliver to" value={job.address || "—"} />
        </View>

        {/*
          What this job is worth to the shop, and what each part is waiting on.
          The amounts are the shop's own earnings — the client's total, the
          delivery fee and GRIDGO's commission are somebody else's money and
          none of them belong on a supplier's screen.
        */}
        {milestones.length ? (
          <View className="mt-6 gap-3">
            <Text className="text-overline text-text-muted">YOUR EARNINGS</Text>
            <View className="gg-card gap-4">
              <View className="flex-row items-end justify-between gap-3">
                <View className="min-w-0 flex-1 gap-0.5">
                  <Text className="text-caption text-text-muted">
                    {split.releasedMinor > 0 ? "Released so far" : "Still to come"}
                  </Text>
                  <Text className="text-h2 text-text-primary">
                    {api.formatPhp(
                      split.releasedMinor > 0
                        ? split.releasedMinor
                        : unreleasedMinor(split),
                    )}
                  </Text>
                </View>
                <Text className="text-caption text-text-muted">
                  of {api.formatPhp(split.totalMinor)}
                </Text>
              </View>
              <View className="gg-divider" />
              <MilestoneList milestones={milestones} showDetail proofReloadVersion={proofReloadVersion} />
            </View>
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          <Text className="text-overline text-text-muted">APPROVED ARTWORK</Text>
          <ArtworkPanel order={job} />
        </View>

        {showCustody ? (
          <View className="gg-panel mt-6 gap-2">
            <View className="flex-row">
              <StatusChip tone={custody.tone} label={custody.label} icon={custody.icon} />
            </View>
            <Text className="text-body text-text-secondary">{custody.detail}</Text>
            <SecondaryButton
              label="Open pickup handoff"
              onPress={() =>
                router.push({ pathname: "/job/[id]/handoff", params: { id: job.id } })
              }
            />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          <Text className="text-overline text-text-muted">TIMELINE</Text>
          <View className="gg-card">
            <JobTimeline timeline={job.timeline} />
          </View>
        </View>

        {primary || secondary.length ? (
          <View className="mt-8 gap-3">
            {primary ? (
              <>
                <Text className="text-body text-text-secondary">{primary.consequence}</Text>
                <PrimaryButton
                  label={primary.label}
                  onPress={() =>
                    router.push({
                      pathname: routeForAction(primary.kind),
                      params: {
                        id: job.id,
                        action: primary.kind,
                        ...(primary.milestoneCode ? { milestone: primary.milestoneCode } : {}),
                      },
                    })
                  }
                />
              </>
            ) : null}
            {secondary.map((action) => (
              <SecondaryButton
                key={action.kind}
                label={action.label}
                onPress={() =>
                  router.push({
                    pathname: routeForAction(action.kind),
                    params: {
                      id: job.id,
                      action: action.kind,
                      ...(action.milestoneCode ? { milestone: action.milestoneCode } : {}),
                    },
                  })
                }
              />
            ))}
          </View>
        ) : (
          <>
            <View className="gg-panel mt-8 gap-1">
              <Text className="text-body font-medium text-text-primary">{waiting.title}</Text>
              <Text className="text-body text-text-secondary">{waiting.body}</Text>
            </View>
            {/*
              The other moment the ask earns itself. This branch is the job with
              nothing for the shop to do — it has accepted, or printed, or filed
              its evidence, and is now waiting on a client's payment or a rider
              at the door. "We will tell your phone" is the answer to the
              question the panel above has just raised. When there *is* an
              action the screen belongs to it, so nothing is offered.
            */}
            <PushEnableCard spacing="above" />
          </>
        )}
      </ScrollView>
    </View>
  );
}
