import { useCallback, useEffect } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, Text, View } from "react-native";
import Animated, { FadeInDown, useReducedMotion } from "react-native-reanimated";
import { router, useFocusEffect, useLocalSearchParams, useNavigation } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { JobTimeline } from "@/components/JobTimeline";
import { JourneyTrack } from "@/components/JourneyTrack";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SpecRow } from "@/components/SpecRow";
import { StatusChip } from "@/components/StatusChip";
import { formatDeadlineFull } from "@/lib/dates";
import * as api from "@/lib/api";
import { custodyForOrder } from "@/lib/handoff";
import { actionsForJob, presentOrderState, routeForAction } from "@/lib/jobState";
import { deadlineUrgency } from "@/lib/urgency";
import { useJob } from "@/hooks/useJob";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * The job workspace: what was agreed, where the job stands, what happened, and
 * the one step the shop can take next. Every step opens its own screen.
 */
export default function JobWorkspaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const colors = useThemeColors();
  const reduceMotion = useReducedMotion();
  const { job, loading, error, reload } = useJob(id);

  // Coming back from a flow screen must show the state the flow produced.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    if (job) navigation.setOptions({ title: job.title });
  }, [job, navigation]);

  if (loading && !job) {
    return (
      <View className="gg-screen items-center justify-center">
        <ActivityIndicator color={colors.textMuted} />
        <Text className="mt-3 text-body text-text-muted">Opening job…</Text>
      </View>
    );
  }

  if (error || !job) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="Job unavailable"
          body={error || "This job is not on your floor."}
          actionLabel="Try again"
          onAction={() => void reload()}
        />
      </View>
    );
  }

  const status = presentOrderState(job.state);
  const actions = actionsForJob(job.state);
  const primary = actions.find((a) => a.primary) ?? null;
  const secondary = actions.filter((a) => !a.primary);
  const urgency = deadlineUrgency(job.promisedDate || job.deadline);
  const custody = custodyForOrder(job);
  const showCustody = ["ready", "rider_assigned", "with_rider"].includes(custody.state);

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page pb-16 pt-4"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void reload()}
            tintColor={colors.textMuted}
          />
        }
      >
        {/*
          The one considered moment in this flow: the header re-enters when the
          job's state changes, so a step the shop just took is visibly the thing
          that moved. Keyed on state so nothing animates on a plain refresh.
        */}
        <Animated.View
          key={job.state}
          entering={reduceMotion ? undefined : FadeInDown.duration(200)}
          className="gap-3"
        >
          <View className="flex-row">
            <StatusChip tone={status.tone} label={status.label} icon={status.icon} />
          </View>
          <Text className="text-h1 text-text-primary">{job.title}</Text>
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
        </Animated.View>

        <View className="mt-6">
          <JourneyTrack state={job.state} />
        </View>

        <View className="gg-card mt-6">
          <Text className="mb-2 text-overline text-text-muted">APPROVED SPEC</Text>
          <SpecRow label="Size" value={job.size || "—"} />
          <SpecRow label="Material" value={job.material || "—"} />
          <SpecRow label="Quantity" value={`${job.quantity}`} />
          <SpecRow label="Artwork" value={job.artworkName || "Not attached"} />
          <SpecRow label="Print total" value={api.formatPhp(job.totalMinor)} />
          <SpecRow label="Deliver to" value={job.address || "—"} />
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
                      params: { id: job.id, action: primary.kind },
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
                    params: { id: job.id, action: action.kind },
                  })
                }
              />
            ))}
          </View>
        ) : (
          <View className="gg-panel mt-8 gap-1">
            <Text className="text-body font-medium text-text-primary">
              Nothing to do on this job right now
            </Text>
            <Text className="text-body text-text-secondary">
              {custody.detail} Pull down to refresh for the next update.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
