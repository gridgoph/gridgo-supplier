import { router, useLocalSearchParams, type Href } from "expo-router";
import { Zap } from "lucide-react-native";
import { useCallback, useState } from "react";
import { ScrollView, Text, View } from "react-native";

import { DangerButton } from "@/components/DangerButton";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonList } from "@/components/Skeleton";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { TeamFace } from "@/components/team/TeamFace";
import { TeamPhotoPicker } from "@/components/team/TeamPhotoPicker";
import { useShopTeam, useTeamViewer } from "@/hooks/useShopTeam";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { roleLabel } from "@/lib/shopTeam";
import { acceptSpeedLabel, canChangeRole, canManagePerson, type TeamPerson } from "@/lib/teamRoster";
import { askConfirm } from "@/store/sheets";

const ROLE_OPTIONS = [
  { value: "staff", label: "Staff" },
  { value: "manager", label: "Manager" },
] as const;

const DATE = new Intl.DateTimeFormat("en-PH", { month: "short", day: "numeric", year: "numeric" });

/**
 * One teammate (report F315793B): their role, whether new jobs alert them,
 * their week, and — for an Owner or a Manager looking — how fast they accept.
 * Remove is last and asks first, and says what stops.
 *
 * Staff open their own card only to set their own alerts and photo; GRIDGO
 * never sends them anyone's speed, so there is nothing here to hide.
 */
export default function TeamPersonScreen() {
  const colors = useThemeColors();
  const { key } = useLocalSearchParams<{ key?: string }>();
  const { team, error, reload } = useShopTeam();
  const { role: viewer, selfKey } = useTeamViewer();
  const [working, setWorking] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const person = team?.people.find((row) => row.key === key) ?? null;
  const self = person != null && person.key === selfKey;
  const manage = person != null && canManagePerson(viewer, person, selfKey);
  const speed = person ? (team?.stats?.members?.find((row) => row.key === person.key) ?? null) : null;
  const fastest = person != null && team?.stats?.fastest?.key === person.key;

  const act = useCallback(
    async (label: string, run: () => Promise<unknown>, fallback: string) => {
      setWorking(label);
      setProblem(null);
      try {
        await run();
      } catch (e) {
        setProblem(humanizeApiError(e, offlineMessage(fallback)));
      } finally {
        setWorking(null);
        void reload();
      }
    },
    [reload],
  );

  const change = useCallback(
    (target: TeamPerson, patch: { role?: "staff" | "manager"; jobAlerts?: boolean; photoFileId?: string | null }) => {
      if (self) return api.updateTeamSelf(patch);
      if (target.kind === "pin") return api.updatePinStaff(target.key, patch);
      const [field, value] = Object.entries(patch)[0] ?? [];
      return api.updateShopMember(target.key, { [field]: value } as Parameters<typeof api.updateShopMember>[1]);
    },
    [self],
  );

  async function remove(target: TeamPerson) {
    const ok = await askConfirm({
      question: `Remove ${target.name} from your shop?`,
      consequence:
        target.kind === "pin"
          ? "Their PIN stops working at once. Jobs they handled keep their name."
          : "They are signed out of your shop on the app and the web at once. Jobs they handled keep their name.",
      confirmLabel: "Remove from shop",
      cancelLabel: `Keep ${target.name}`,
      destructive: true,
    });
    if (!ok) return;
    await act(
      "remove",
      () => (target.kind === "pin" ? api.removePinStaff(target.key) : api.removeShopMember(target.key)),
      "remove this person",
    );
    router.back();
  }

  if (!team && !error) {
    return (
      <View className="gg-screen gg-page pt-4">
        <SkeletonList label="Loading this person" count={2} />
      </View>
    );
  }
  if (!person) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title={error ? "This person is not reachable" : "Not on the team any more"}
          body={error ?? "They may have been removed. Your team list is up to date."}
          actionLabel={error ? "Try again" : "Back to the team"}
          onAction={() => (error ? void reload() : router.back())}
        />
      </View>
    );
  }

  const joined = person.createdAt ? DATE.format(new Date(person.createdAt)) : null;
  const how = person.kind === "pin" ? "uses the shop phone" : "own phone";

  return (
    <View className="gg-screen">
      <ScrollView className="flex-1" contentContainerClassName="gg-page gap-6 pb-10 pt-4">
        <View className="flex-row items-center gap-4">
          <TeamFace name={person.name} photoFileId={person.photoFileId} size={72} />
          <View className="min-w-0 flex-1 gap-0.5">
            <Text className="text-h2 text-text-primary" numberOfLines={2} accessibilityRole="header">
              {self ? `${person.name} (you)` : person.name}
            </Text>
            <Text className="text-body text-text-secondary">
              {[roleLabel(person.role), joined ? `joined ${joined}` : null, how].filter(Boolean).join(" · ")}
            </Text>
            {person.kind === "pin" && person.onShift ? (
              <Text className="text-caption text-text-muted">On shift now</Text>
            ) : null}
          </View>
        </View>

        {fastest ? (
          <View className="flex-row items-center gap-2 self-start rounded-pill border border-outline px-3 py-1">
            <Zap size={16} color={colors.textPrimary} aria-hidden />
            <Text className="text-body font-bold text-text-primary">Fastest this week</Text>
          </View>
        ) : null}

        {problem ? <ErrorNotice message={problem} /> : null}

        {canChangeRole(viewer, person) && person.key !== selfKey ? (
          <View className="gap-2">
            <SegmentedControl
              options={ROLE_OPTIONS}
              value={person.role === "manager" ? "manager" : "staff"}
              onChange={(next) => {
                if (next !== person.role) void act("role", () => change(person, { role: next }), "change their role");
              }}
              accessibilityLabel={`${person.name}'s role`}
            />
            <Text className="text-body text-text-secondary">
              A manager can also change hours, products and staff. Only you see Money.
            </Text>
          </View>
        ) : null}

        {manage || self ? (
          <View className="gap-4">
            {team?.hasPinStaff ? (
              <SwitchRow
                value={person.jobAlerts}
                onChange={(value) => void act("alerts", () => change(person, { jobAlerts: value }), "change job alerts")}
                disabled={working != null}
                label="Gets job alerts"
                hint={
                  person.kind === "pin"
                    ? self
                      ? "Shows you new jobs when you pick yourself on the shop phone."
                      : "Shows new jobs to them when they pick themselves on the shop phone."
                    : self
                      ? "New jobs and Express offers reach your phone."
                      : "New jobs and Express offers reach their phone."
                }
              />
            ) : null}
            {team?.hasPinStaff && (person.kind === "pin" || self || person.status === "active") ? (
              <TeamPhotoPicker
                name={person.name}
                photoFileId={person.photoFileId}
                disabled={working != null}
                onStored={(fileId) => void act("photo", () => change(person, { photoFileId: fileId }), "save the photo")}
              />
            ) : null}
          </View>
        ) : null}

        {speed ? (
          <View className="flex-row gap-3" testID="person-week">
            <View className="gg-panel flex-1 gap-1">
              <Text className="text-caption text-text-muted">Jobs this week</Text>
              <Text className="text-h2 text-text-primary">{speed.jobsThisWeek}</Text>
            </View>
            <View className="gg-panel flex-1 gap-1">
              <Text className="text-caption text-text-muted">Avg time to accept</Text>
              <Text className="text-h2 text-text-primary">{acceptSpeedLabel(speed.averageAcceptSeconds) ?? "—"}</Text>
            </View>
          </View>
        ) : null}

        {manage && person.kind === "pin" ? (
          <SecondaryButton
            label="Give a new PIN"
            onPress={() =>
              router.push({ pathname: "/team-pin", params: { reset: person.key, name: person.name } } as unknown as Href)
            }
          />
        ) : null}

        {manage ? (
          <DangerButton
            label={working === "remove" ? "Removing…" : "Remove from shop"}
            disabled={working != null}
            onPress={() => void remove(person)}
          />
        ) : null}
      </ScrollView>
    </View>
  );
}
