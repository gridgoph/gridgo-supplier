import { useCallback, useEffect, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";

import { AcceptWindowPanel } from "@/components/AcceptWindowPanel";
import { CounterCheckPanel } from "@/components/CounterCheckPanel";
import { DangerButton } from "@/components/DangerButton";
import { DeadlineRequestPanel } from "@/components/DeadlineRequestPanel";
import { EmptyState } from "@/components/EmptyState";
import { JobActionBar } from "@/components/JobActionBar";
import { JobBrief } from "@/components/JobBrief";
import { JourneyTrack } from "@/components/JourneyTrack";
import { LatenessPanel } from "@/components/LatenessPanel";
import { PrimaryButton } from "@/components/PrimaryButton";
import { PushEnableCard } from "@/components/PushEnableCard";
import { RefundNoticePanel } from "@/components/RefundNoticePanel";
import { SkeletonBlock } from "@/components/Skeleton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { ShopReleasePanel } from "@/components/ShopReleasePanel";
import { StatusChip } from "@/components/StatusChip";
import { acceptWindow } from "@/lib/acceptWindow";
import { formatDeadlineFull } from "@/lib/dates";
import { defaultBriefSection, hasHandoff, workspaceBriefSections } from "@/lib/jobBrief";
import {
  actionsForJob,
  presentJobStatus,
  routeForAction,
  waitingOn,
  type SupplierAction,
} from "@/lib/jobState";
import { keptAfterSettlement, payoutPlanOf } from "@/lib/milestones";
import { lapseForOrder, lapseNotice } from "@/lib/productionLapse";
import { refundNotice, refundStanding } from "@/lib/refund";
import { canRequestNewDeadline, rescheduleNotice } from "@/lib/reschedule";
import { canCancelJob, shopRelease } from "@/lib/shopRecovery";
import { counterCheck } from "@/lib/pickupCheck";
import { deadlineUrgency } from "@/lib/urgency";
import { useViewing } from "@/store/toasts";
import { useJob } from "@/hooks/useJob";
import { useProductionLapses } from "@/hooks/useProductionLapses";
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
  const lapses = useProductionLapses();
  const [proofReloadVersion, setProofReloadVersion] = useState(0);
  // Bumped when the hour to answer runs out on screen, so the steps go with it.
  const [, setExpiredAt] = useState(0);
  const onAnswerExpired = useCallback(() => setExpiredAt(Date.now()), []);
  const reloadLapses = lapses.reload;
  const { refreshing, onRefresh } = usePullToRefresh(useCallback(async () => {
    await Promise.all([reload(), reloadLapses()]);
    setProofReloadVersion((version) => version + 1);
  }, [reload, reloadLapses]));

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

  const status = presentJobStatus(job);
  const clientDate = job.promisedDate || job.deadline;
  const actions = actionsForJob(job);
  const primary = actions.find((a) => a.primary) ?? null;
  const secondary = actions.filter((a) => !a.primary);
  // A job the shop let go keeps its state while the client chooses; it is not the shop's any more.
  const release = shopRelease(job);
  const deadlineRequest = job.rescheduleRequest ?? null;
  const requestStopped = deadlineRequest ? rescheduleNotice(deadlineRequest).stopped : false;
  // A job stopped or closed by a refund, let go, or paused by a declined deadline is not due anywhere.
  const urgency = deadlineUrgency(
    refundStanding(job) === "none" && !release && !requestStopped ? job.promisedDate || job.deadline : null,
  );
  const waiting = waitingOn(job.state, payoutPlanOf(job));
  // A refund stops the job and speaks over whose move it is.
  const refund = refundNotice(job, keptAfterSettlement(job));
  const handoff = hasHandoff(job) && refundStanding(job) === "none" && !release && !requestStopped;
  const hasSteps = Boolean(primary) || secondary.length > 0 || handoff;
  // A counter check that stopped the pickup, or is waiting to be repeated.
  const check = job.state === "rider_assigned" ? counterCheck(job) : null;
  // A refund outranks it: the pickup is not happening while the job is stopped.
  const counterIssue = check && check.stage !== "passed" && refundStanding(job) === "none" ? check : null;
  // GRIDGO's late-production record for this job, if it has one.
  const lapse = lapseForOrder(lapses.lapses, job.id);
  // A held job's late card yields its next step to the hold; a job the shop let go has no late card here.
  const lateness = lapse && !release ? lapseNotice(lapse, job, undefined, requestStopped || refundStanding(job) !== "none") : null;

  const canAskForTime = canRequestNewDeadline(job);
  const canCancel = canCancelJob(job);

  function messageOperations() {
    router.push({ pathname: "/report", params: { orderId: job!.id, title: job!.title } });
  }

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
          {clientDate ? (
            <Text className="text-body-lg text-text-secondary">
              {job.promisedDate ? "Promised" : "Client needs it by"}{" "}
              {formatDeadlineFull(clientDate)}
            </Text>
          ) : null}
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

        {/*
          A new job's clock, above everything else on it: the one thing here
          that costs the shop if it is missed.
        */}
        {acceptWindow(job).kind !== "none" ? (
          <View className="mt-6">
            <AcceptWindowPanel order={job} onExpire={onAnswerExpired} />
          </View>
        ) : null}

        <View className="mt-6">
          <JourneyTrack state={job.state} />
        </View>

        {/*
          Whose move it is, said before the detail. A screen that only says
          "nothing to do" leaves a supplier guessing; this one names the
          person or the clock the job is waiting on, in two lines, where the
          eye lands after the track. A stopped pickup outranks it: that is the
          one thing on this job the shop has to fix.
        */}
        {counterIssue ? (
          <View className="mt-6">
            <CounterCheckPanel check={counterIssue} onMessageOperations={messageOperations} />
          </View>
        ) : refund ? (
          <View className="mt-6">
            <RefundNoticePanel notice={refund} />
          </View>
        ) : release ? (
          <View className="mt-6">
            <ShopReleasePanel release={release} />
          </View>
        ) : deadlineRequest && requestStopped ? (
          <View className="mt-6">
            <DeadlineRequestPanel request={deadlineRequest} />
          </View>
        ) : !primary ? (
          <View className="gg-panel mt-6 gap-1">
            <Text className="text-body font-medium text-text-primary">{waiting.title}</Text>
            <Text className="text-body text-text-secondary">{waiting.body}</Text>
          </View>
        ) : null}

        {/*
          A late job, beside whose move it is rather than instead of it: the
          next step still belongs to the job, and the warning says what the
          lateness means for the shop's money and record.
        */}
        {lateness && lapse ? (
          <View className="mt-6">
            <LatenessPanel notice={lateness} closed={lapse.status === "closed"} />
          </View>
        ) : null}

        {/* The job's one deadline request, while the job carries on. */}
        {deadlineRequest && !requestStopped && !release ? (
          <View className="mt-6">
            <DeadlineRequestPanel request={deadlineRequest} />
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

        {/*
          Last, and charcoal: the way out when the job itself is what is wrong.
          The report carries this job's reference, so Operations starts from it.
        */}
        {counterIssue || release ? null : (
          <View className="mt-8 gap-3">
            {canAskForTime || canCancel ? (
              <Text className="text-overline text-text-muted">RUNNING INTO TROUBLE?</Text>
            ) : null}
            {canAskForTime ? (
              <View className="gap-1">
                <SecondaryButton
                  label="Request a new deadline"
                  onPress={() => router.push({ pathname: "/job/[id]/reschedule", params: { id: job.id } })}
                />
                <Text className="text-caption text-text-muted">
                  You can ask the client once on this job. Nothing changes until they agree.
                </Text>
              </View>
            ) : null}
            <SecondaryButton label="Report a problem with this job" onPress={messageOperations} />
            {canCancel ? (
              <DangerButton
                label="Cancel this job"
                onPress={() => router.push({ pathname: "/job/[id]/cancel", params: { id: job.id } })}
              />
            ) : null}
          </View>
        )}
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
