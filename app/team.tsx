import { router, type Href } from "expo-router";
import { ChevronRight, Link2, Mail, Phone, QrCode, Send, Smartphone, UserRound, X, Zap, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, Share, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { SwitchRow } from "@/components/controls/SwitchRow";
import { TeamFace } from "@/components/team/TeamFace";
import { TeamWeekCard } from "@/components/team/TeamWeekCard";
import { useShopTeam, useTeamViewer } from "@/hooks/useShopTeam";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  inviteTarget,
  inviteTimeLeft,
  isLiveInvite,
  joinMessage,
  joinTeamLink,
  roleLabel,
  type InviteKind,
  type TeamInvite,
} from "@/lib/shopTeam";
import { canManageTeam, personLine, teamLayout, type TeamPerson } from "@/lib/teamRoster";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";
import { useShopWorker } from "@/store/shopWorker";

const KIND_ICON: Record<InviteKind, LucideIcon> = { email: Mail, phone: Phone, qr: QrCode, link: Link2 };

/**
 * The shop's team (report F315793B): the shop card with its Owner and
 * Managers, the staff with or without a phone, the week's positive view, and
 * the three ways to add someone.
 *
 * What a viewer sees is GRIDGO's decision first: Staff receive active people
 * only, no invites and no per-person speed. On top of that, only an Owner or
 * a Manager is offered changes. People waiting on an answer come first and
 * carry the yellow, because until they are answered they can do nothing.
 *
 * An older GRIDGO (no `pinStaff` in the answer) still draws the roster and the
 * link and QR invites; the PIN, the shared phone and the weekly view are not
 * offered, so nothing on screen leads to a route that is not there.
 */
export default function TeamScreen() {
  const colors = useThemeColors();
  const { team, error, reload } = useShopTeam();
  const { role, selfKey } = useTeamViewer();
  const owner = role === "owner";
  const manage = canManageTeam(role);
  const fallbackShopName = useSession((s) => s.user?.supplierName ?? null);
  const enterShared = useShopWorker((s) => s.enter);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const { refreshing, onRefresh } = usePullToRefresh(reload);

  async function act(key: string, run: () => Promise<unknown>, fallback: string) {
    setWorking(key);
    setActionError(null);
    try {
      await run();
    } catch (e) {
      setActionError(humanizeApiError(e, offlineMessage(fallback)));
    } finally {
      setWorking(null);
      void reload();
    }
  }

  async function decline(person: TeamPerson) {
    const ok = await askConfirm({
      question: `Decline ${person.name}?`,
      consequence: "They will need a new invite to ask again.",
      confirmLabel: "Decline",
      cancelLabel: "Keep waiting",
      destructive: true,
    });
    if (ok) await act(person.key, () => api.removeShopMember(person.key), "decline this person");
  }

  async function cancelInvite(invite: TeamInvite) {
    const ok = await askConfirm({
      question: `Cancel the invite for ${inviteTarget(invite)}?`,
      consequence: "The link and QR stop working.",
      confirmLabel: "Cancel invite",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (ok) await act(invite.id, () => api.revokeShopInvite(invite.id), "cancel this invite");
  }

  /** Send link: GRIDGO makes a 24-hour link and the phone's own share sheet sends it. */
  async function sendLink() {
    await act(
      "send-link",
      async () => {
        const made = await api.createShopInvite("link");
        await Share.share({ message: joinMessage(joinTeamLink(made.token)) });
      },
      "make a link",
    );
  }

  async function shareThisPhone() {
    const ok = await askConfirm({
      question: "Use this phone for PIN staff?",
      consequence:
        "Your alerts stop on this phone and your own screens close. Staff pick themselves with their PIN. To get your screens back, sign out and sign in again, or use your own phone.",
      confirmLabel: "Start",
      cancelLabel: "Not now",
    });
    if (ok) await enterShared(team?.shopName ?? fallbackShopName);
  }

  const layout = team ? teamLayout(team.people) : null;
  const openInvites = team ? team.invites.filter((invite) => isLiveInvite(invite)) : [];
  const fastestKey = team?.stats?.fastest?.key ?? null;
  const pinPeople = team?.people.filter((person) => person.kind === "pin" && person.status === "active") ?? [];

  function openPerson(person: TeamPerson) {
    router.push({ pathname: "/team-person", params: { key: person.key } } as unknown as Href);
  }

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-8 pb-10 pt-4"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />}
      >
        {!team && !error ? <SkeletonList label="Loading your team" count={3} /> : null}
        {error && !team ? (
          <EmptyState title="Your team is not reachable" body={error} actionLabel="Try again" onAction={() => void reload()} />
        ) : null}
        {error && team ? <ErrorNotice message={error} onRetry={() => void reload()} /> : null}
        {actionError ? <ErrorNotice message={actionError} /> : null}

        {team && layout ? (
          <>
            {/* The shop card: whose shop, and who runs it. */}
            <View className="gg-card gap-4" testID="team-shop-card">
              <View className="gap-0.5">
                <Text className="text-h2 text-text-primary" numberOfLines={2}>
                  {team.shopName ?? fallbackShopName ?? "Your shop"}
                </Text>
                <Text className="text-body text-text-secondary">Your team</Text>
              </View>
              <View className="flex-row flex-wrap gap-4">
                {layout.leads.map((person) => (
                  <FaceTile
                    key={person.key}
                    person={person}
                    self={person.key === selfKey}
                    caption={roleLabel(person.role)}
                    fastest={person.key === fastestKey}
                    onPress={() => openPerson(person)}
                  />
                ))}
              </View>
            </View>

            {manage && layout.waiting.length ? (
              <View className="gap-3">
                <SectionHeader title="WANTS TO JOIN" count={layout.waiting.length} />
                {layout.waiting.map((person, index) => (
                  <View key={person.key} className="gg-card gap-4">
                    <View className="flex-row items-center gap-3">
                      <TeamFace name={person.name} photoFileId={person.photoFileId} size={40} />
                      <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary" numberOfLines={2}>
                        {person.name}
                      </Text>
                      <StatusChip tone="warning" icon="clock" label="Waiting" />
                    </View>
                    <View className="flex-row gap-3">
                      <View className="flex-1">
                        <SecondaryButton
                          label="Decline"
                          accessibilityLabel={`Decline ${person.name}`}
                          disabled={working != null}
                          onPress={() => void decline(person)}
                        />
                      </View>
                      <View className="flex-1">
                        {index === 0 ? (
                          <PrimaryButton
                            label={working === person.key ? "Approving…" : "Approve"}
                            disabled={working != null}
                            onPress={() =>
                              void act(person.key, () => api.updateShopMember(person.key, { status: "active" }), "approve this person")
                            }
                          />
                        ) : (
                          <SecondaryButton
                            label="Approve"
                            accessibilityLabel={`Approve ${person.name}`}
                            disabled={working != null}
                            onPress={() =>
                              void act(person.key, () => api.updateShopMember(person.key, { status: "active" }), "approve this person")
                            }
                          />
                        )}
                      </View>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            <View className="gap-3">
              <SectionHeader
                title="STAFF"
                count={layout.staff.length}
                right={
                  team.hasPinStaff && layout.onShift ? (
                    <StatusChip tone="success" icon="circle-check" label={`${layout.onShift} on shift`} />
                  ) : undefined
                }
              />
              {layout.staff.length ? (
                <View className="flex-row flex-wrap gap-y-4" testID="team-staff-grid">
                  {layout.staff.map((person) => (
                    <View key={person.key} className="w-1/4 items-center">
                      <FaceTile
                        person={person}
                        self={person.key === selfKey}
                        caption={personLine(person)}
                        fastest={person.key === fastestKey}
                        onPress={() => openPerson(person)}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <Text className="text-body text-text-secondary">
                  {manage ? "No staff yet. Add someone below." : "No other staff yet."}
                </Text>
              )}
            </View>

            {team.stats ? <TeamWeekCard stats={team.stats} /> : null}

            {manage && openInvites.length ? (
              <View className="gap-3">
                <SectionHeader title="INVITED" count={openInvites.length} />
                <View className="gg-card-flush">
                  {openInvites.map((invite, index) => {
                    const Icon = KIND_ICON[invite.kind] ?? Link2;
                    return (
                      <View
                        key={invite.id}
                        className={
                          index === 0
                            ? "min-h-16 flex-row items-center gap-3 px-4 py-3"
                            : "min-h-16 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"
                        }
                      >
                        <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
                          <Icon size={18} color={colors.textPrimary} aria-hidden />
                        </View>
                        <Text className="min-w-0 flex-1 text-body text-text-primary" numberOfLines={1}>
                          {inviteTarget(invite)}
                        </Text>
                        <StatusChip tone="neutral" icon="clock" label={`${inviteTimeLeft(invite.expiresAt) ?? ""} left`} />
                        <Pressable
                          onPress={() => void cancelInvite(invite)}
                          disabled={working != null}
                          accessibilityRole="button"
                          accessibilityLabel={`Cancel the invite for ${inviteTarget(invite)}`}
                          className="gg-touch h-11 w-11 items-center justify-center rounded-pill"
                          style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                        >
                          <X size={20} color={colors.textMuted} aria-hidden />
                        </Pressable>
                      </View>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {manage ? (
              <View className="gap-3">
                <SectionHeader title="ADD STAFF" />
                <View className="gg-card-flush">
                  <OptionRow
                    icon={Send}
                    title={working === "send-link" ? "Making a link…" : "Send link"}
                    detail="Messenger, Viber or text"
                    disabled={working != null}
                    onPress={() => void sendLink()}
                  />
                  <OptionRow
                    icon={QrCode}
                    title="Show QR"
                    detail="They scan it with their phone camera"
                    onPress={() => router.push({ pathname: "/team-invite", params: { kind: "qr" } } as unknown as Href)}
                    divided
                  />
                  {team.hasPinStaff ? (
                    <OptionRow
                      icon={UserRound}
                      title="Staff without a phone or account"
                      detail="A name and a 4-digit PIN. They use this shop phone."
                      onPress={() => router.push("/team-pin" as Href)}
                      divided
                    />
                  ) : null}
                </View>
                <Text className="text-caption text-text-muted">
                  Links and QR codes last 24 hours and work once. You approve each person who joins.
                </Text>
              </View>
            ) : null}

            {manage && team.hasPinStaff && pinPeople.length ? (
              <View className="gap-3">
                <SectionHeader title="SHOP PHONE" />
                <View className="gg-card-flush">
                  <OptionRow
                    icon={Smartphone}
                    title="Use this phone for PIN staff"
                    detail="Staff tap their face and PIN. Every job shows who handled it."
                    onPress={() => void shareThisPhone()}
                  />
                </View>
              </View>
            ) : null}

            {owner && team.hasPinStaff && team.settings ? (
              <View className="gap-1">
                <SectionHeader title="TEAM VIEW" />
                <SwitchRow
                  value={team.settings.showRankingToStaff}
                  onChange={(value) =>
                    void act("ranking", () => api.updateTeamSettings({ showRankingToStaff: value }), "change this setting")
                  }
                  disabled={working != null}
                  label="Show the fastest badge to staff"
                  hint="Staff always see the team mission. Only you and managers see each person's speed."
                />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function FaceTile({
  person,
  self,
  caption,
  fastest,
  onPress,
}: {
  person: TeamPerson;
  self: boolean;
  caption: string;
  fastest: boolean;
  onPress: () => void;
}) {
  const colors = useThemeColors();
  const name = self ? `${person.name} (you)` : person.name;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${caption}${fastest ? ", fastest this week" : ""}`}
      className="w-20 items-center gap-1"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View>
        <TeamFace name={person.name} photoFileId={person.photoFileId} size={64} />
        {fastest ? (
          <View className="absolute -bottom-1 -right-1 h-7 w-7 items-center justify-center rounded-pill border border-outline bg-surface">
            <Zap size={14} color={colors.textPrimary} aria-hidden />
          </View>
        ) : null}
        {person.onShift ? (
          <View className="absolute -left-0.5 -top-0.5 h-4 w-4 rounded-pill border-2 border-surface bg-success" aria-hidden />
        ) : null}
      </View>
      <Text className="text-body font-bold text-text-primary" numberOfLines={1}>
        {self ? "You" : person.name}
      </Text>
      <Text className="text-center text-caption text-text-muted" numberOfLines={2}>
        {caption}
      </Text>
    </Pressable>
  );
}

function OptionRow({
  icon: Icon,
  title,
  detail,
  onPress,
  disabled = false,
  divided = false,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  onPress: () => void;
  disabled?: boolean;
  divided?: boolean;
}) {
  const colors = useThemeColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      accessibilityState={{ disabled }}
      className={[
        "min-h-16 flex-row items-center gap-3 px-4 py-3",
        divided ? "border-t border-outline-subtle" : "",
        disabled ? "gg-disabled" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant">
        <Icon size={20} color={colors.textPrimary} aria-hidden />
      </View>
      <View className="min-w-0 flex-1">
        <Text className="text-body font-bold text-text-primary">{title}</Text>
        <Text className="text-caption text-text-muted">{detail}</Text>
      </View>
      <ChevronRight size={20} color={colors.textMuted} aria-hidden />
    </Pressable>
  );
}

