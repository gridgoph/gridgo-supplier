import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { JobActionBar } from "@/components/JobActionBar";
import { JobBrief } from "@/components/JobBrief";
import { JourneyTrack } from "@/components/JourneyTrack";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
import { SkeletonBlock } from "@/components/Skeleton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull } from "@/lib/dates";
import { defaultBriefSection, hasHandoff, workspaceBriefSections } from "@/lib/jobBrief";
import {
  actionsForJob,
  presentOrderState,
  routeForAction,
  waitingOn,
  type SupplierAction,
} from "@/lib/jobState";
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
  const waiting = waitingOn(job.state);
  const handoff = hasHandoff(job);
  const hasSteps = Boolean(primary) || secondary.length > 0 || handoff;

  function openStep(action: SupplierAction) {
    router.push({
      pathname: routeForAction(action.kind),
      params: {
        id: job!.id,
        action: action.kind,
        ...(action.milestoneCode ? { milestone: action.milestoneCode } : {}),
      },
    });
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-8 pt-4"
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

        {/*
          Whose move it is, said before the detail. A screen that only says
          "nothing to do" leaves a supplier guessing; this one names the
          person or the clock the job is waiting on, in two lines, where the
          eye lands after the track.
        */}
        {!primary ? (
          <View className="gg-panel mt-6 gap-1">
            <Text className="text-body font-medium text-text-primary">{waiting.title}</Text>
            <Text className="text-body text-text-secondary">{waiting.body}</Text>
          </View>
        ) : null}

        {/*
          The whole job as one docket. The specification, the files, the
          date, the money and the history each stated on their own closed row,
          with the row the next step is about already open. Stacked flat these
          put the shop's one action a fourth screen down; folded, the job reads
          in one, and the action never moves.
        */}
        <View className="mt-6 gap-3">
          <Text className="text-overline text-text-muted">THE JOB</Text>
          <JobBrief
            key={job.state}
            order={job}
            sections={workspaceBriefSections(job)}
            defaultOpen={defaultBriefSection(job)}
            proofReloadVersion={proofReloadVersion}
          />
        </View>

        {/*
          The moment the ask earns itself: a job with nothing for the shop to
          do, waiting on a client's payment or a rider at the door. "We will
          tell your phone" is the answer to the question the panel above has
          just raised. When there *is* an action the screen belongs to it, so
          nothing is offered.
        */}
        {!primary ? <PushEnableCard spacing="above" /> : null}
      </ScrollView>

      {hasSteps ? (
        <JobActionBar consequence={primary?.consequence}>
          {primary ? <PrimaryButton label={primary.label} onPress={() => openStep(primary)} /> : null}
          {secondary.map((action) => (
            <SecondaryButton key={action.kind} label={action.label} onPress={() => openStep(action)} />
          ))}
          {handoff ? (
            <SecondaryButton
              label="Open pickup handoff"
              onPress={() => router.push({ pathname: "/job/[id]/handoff", params: { id: job.id } })}
            />
          ) : null}
        </JobActionBar>
      ) : null}
    </View>
  );
}
