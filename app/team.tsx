import { router, useFocusEffect } from "expo-router";
import { Link2, Mail, Phone, QrCode, UserMinus, X, type LucideIcon } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SectionHeader } from "@/components/SectionHeader";
import { SkeletonList } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useReadVersion } from "@/hooks/useReadVersion";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  inviteTarget,
  inviteTimeLeft,
  isLiveInvite,
  roleLabel,
  teamSections,
  type InviteKind,
  type TeamInvite,
  type TeamMember,
} from "@/lib/shopTeam";
import { askConfirm } from "@/store/sheets";
import { useSession } from "@/store/session";

const KIND_ICON: Record<InviteKind, LucideIcon> = {
  email: Mail,
  phone: Phone,
  qr: QrCode,
  link: Link2,
};

/**
 * The Owner's team: who can sign in for the shop, who is waiting to, and the
 * invites still open.
 *
 * People waiting on the Owner come first and carry the yellow, because until
 * they are answered they can do nothing at all. Adding someone is the screen's
 * own action at the bottom, and goes yellow only when nobody is waiting.
 */
export default function TeamScreen() {
  const colors = useThemeColors();
  const me = useSession((s) => s.user?.id ?? null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invites, setInvites] = useState<TeamInvite[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);

  const nextRead = useReadVersion();
  const reload = useCallback(async () => {
    const current = nextRead();
    try {
      const team = await api.getShopTeam();
      if (!current()) return;
      setMembers(team.members);
      setInvites(team.invites);
      setError(null);
      setLoaded(true);
    } catch (e) {
      if (!current()) return;
      setError(humanizeApiError(e, offlineMessage("load your team")));
    }
  }, [nextRead]);

  useLiveRefresh(["identity", "approvals"], reload);
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );
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

  async function decline(member: TeamMember) {
    const ok = await askConfirm({
      question: `Decline ${member.name}?`,
      consequence: "They will need a new invite to ask again.",
      confirmLabel: "Decline",
      cancelLabel: "Keep waiting",
      destructive: true,
    });
    if (ok) await act(member.userId, () => api.removeShopMember(member.userId), "decline this person");
  }

  async function remove(member: TeamMember) {
    const ok = await askConfirm({
      question: `Remove ${member.name} from your team?`,
      consequence: "They are signed out of your shop on the app and the web at once.",
      confirmLabel: "Remove",
      cancelLabel: "Keep them",
      destructive: true,
    });
    if (ok) await act(member.userId, () => api.removeShopMember(member.userId), "remove this person");
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

  const { pending, active } = teamSections(members);
  const openInvites = invites.filter((invite) => isLiveInvite(invite));

  return (
    <View className="gg-screen">
      <ScrollView
        className="flex-1"
        contentContainerClassName="gg-page gap-8 pb-10 pt-4"
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.textMuted} />
        }
      >
        {!loaded && !error ? <SkeletonList label="Loading your team" count={3} /> : null}
        {error && !loaded ? (
          <EmptyState
            title="Your team is not reachable"
            body={error}
            actionLabel="Try again"
            onAction={() => void reload()}
          />
        ) : null}
        {error && loaded ? <ErrorNotice message={error} onRetry={() => void reload()} /> : null}
        {actionError ? <ErrorNotice message={actionError} /> : null}

        {pending.length ? (
          <View className="gap-3">
            <SectionHeader title="WANTS TO JOIN" count={pending.length} />
            {pending.map((member) => (
              <View key={member.userId} className="gg-card gap-4">
                <View className="flex-row items-center gap-3">
                  <Initial name={member.name} />
                  <Text className="min-w-0 flex-1 text-body-lg font-medium text-text-primary" numberOfLines={2}>
                    {member.name}
                  </Text>
                  <StatusChip tone="warning" icon="clock" label="Waiting" />
                </View>
                <View className="flex-row gap-3">
                  <View className="flex-1">
                    <SecondaryButton
                      label="Decline"
                      accessibilityLabel={`Decline ${member.name}`}
                      disabled={working != null}
                      onPress={() => void decline(member)}
                    />
                  </View>
                  <View className="flex-1">
                    <PrimaryButton
                      label={working === member.userId ? "Approving…" : "Approve"}
                      disabled={working != null}
                      onPress={() =>
                        void act(
                          member.userId,
                          () => api.updateShopMember(member.userId, { status: "active" }),
                          "approve this person",
                        )
                      }
                    />
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : null}

        {loaded ? (
          <View className="gap-3">
            <SectionHeader title="TEAM" count={active.length} />
            <View className="gg-card-flush">
              {active.map((member, index) => {
                const self = member.userId === me;
                return (
                  <View
                    key={member.userId}
                    className={
                      index === 0
                        ? "min-h-16 flex-row items-center gap-3 px-4 py-3"
                        : "min-h-16 flex-row items-center gap-3 border-t border-outline-subtle px-4 py-3"
                    }
                  >
                    <Initial name={member.name} />
                    <View className="min-w-0 flex-1">
                      <Text className="text-body font-medium text-text-primary" numberOfLines={1}>
                        {self ? `${member.name} (you)` : member.name}
                      </Text>
                      <Text className="text-caption text-text-muted">{roleLabel(member.role)}</Text>
                    </View>
                    {self || member.role === "owner" ? null : (
                      <Pressable
                        onPress={() => void remove(member)}
                        disabled={working != null}
                        accessibilityRole="button"
                        accessibilityLabel={`Remove ${member.name}`}
                        className="gg-touch h-11 w-11 items-center justify-center rounded-pill"
                        style={({ pressed }) => (pressed ? { opacity: 0.6 } : undefined)}
                      >
                        <UserMinus size={20} color={colors.error} aria-hidden />
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}

        {openInvites.length ? (
          <View className="gap-3">
            <SectionHeader title="OPEN INVITES" count={openInvites.length} />
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
                    <StatusChip tone="neutral" icon="clock" label={inviteTimeLeft(invite.expiresAt) ?? ""} />
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

        {loaded ? (
          pending.length ? (
            <SecondaryButton label="Add staff" onPress={() => router.push("/team-invite")} />
          ) : (
            <PrimaryButton label="Add staff" onPress={() => router.push("/team-invite")} />
          )
        ) : null}
      </ScrollView>
    </View>
  );
}

function Initial({ name }: { name: string }) {
  const letter = name.trim().charAt(0).toUpperCase() || "?";
  return (
    <View className="h-10 w-10 items-center justify-center rounded-pill bg-surface-variant" aria-hidden>
      <Text className="text-body font-medium text-text-primary">{letter}</Text>
    </View>
  );
}
