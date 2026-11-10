import { useAuth } from "@clerk/expo";
import * as Linking from "expo-linking";
import { router, useFocusEffect } from "expo-router";
import { QrCode, Store } from "lucide-react-native";
import { useCallback, useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { StatusChip } from "@/components/StatusChip";
import { TextField } from "@/components/controls/TextField";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import { inviteTimeLeft, tokenFromLink, type TeamInvite } from "@/lib/shopTeam";
import { useSession } from "@/store/session";
import { useTeamJoin } from "@/store/teamJoin";

/**
 * Join a shop's team.
 *
 * Three ways in, one screen: an invite sent to the person's own email or phone
 * (found after sign-in), the Owner's QR scanned here, or the Owner's link.
 * Whatever happens, the person ends up waiting for the Owner — joining never
 * opens a shop by itself.
 */
export default function JoinTeamScreen() {
  const { isLoaded, isSignedIn } = useAuth();
  const colors = useThemeColors();
  const token = useTeamJoin((s) => s.token);
  const identity = useSession((s) => s.identity);
  const logout = useSession((s) => s.logout);
  const url = Linking.useLinkingURL();
  const [invites, setInvites] = useState<TeamInvite[] | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // A join link that opened the app carries its token in the fragment.
  useEffect(() => {
    useTeamJoin.getState().startJoining();
    const fromLink = tokenFromLink(url);
    if (fromLink) useTeamJoin.getState().holdToken(fromLink);
  }, [url]);

  // Wait for the session bridge to settle: on a cold open from a link this
  // screen mounts before the bearer is attached, and discovery needs it.
  const settled = isSignedIn === true && identity.kind !== "loading" && identity.kind !== "signed_out";

  const loadInvites = useCallback(async () => {
    if (!settled) return;
    try {
      setInvites(await api.discoverShopInvites());
    } catch {
      // Discovery is a convenience; the QR and the link still work.
      setInvites([]);
    }
  }, [settled]);

  useFocusEffect(
    useCallback(() => {
      void loadInvites();
    }, [loadInvites]),
  );

  async function claim(claimWith: { token: string } | { inviteId: string }) {
    setBusy(true);
    setProblem(null);
    try {
      await api.claimShopInvite(claimWith);
      useTeamJoin.getState().clear();
      await useSession.getState().recheckTeam();
      const now = useSession.getState();
      if (now.identity.kind === "team_pending") router.replace("/team-waiting");
      else router.replace("/");
    } catch (error) {
      if ("token" in claimWith) useTeamJoin.getState().dropToken();
      setProblem(humanizeApiError(error, offlineMessage("join this team")));
    } finally {
      setBusy(false);
    }
  }

  function claimPasted() {
    const found = tokenFromLink(pasted);
    if (!found) {
      setProblem("That is not a GRIDGO team link. Copy the whole link the owner sent.");
      return;
    }
    setPasted("");
    void claim({ token: found });
  }

  if (!isLoaded) {
    return (
      <View className="gg-screen gg-page gap-4 pt-6">
        <SkeletonBlock className="h-8 w-2/3" />
        <SkeletonBlock className="h-12 w-full" />
        <SkeletonBlock className="h-12 w-full" />
      </View>
    );
  }

  if (!isSignedIn) {
    return (
      <FormScrollView contentClassName="gg-page gap-6 pb-10 pt-6">
        <View className="gap-2">
          <Text className="text-h1 text-text-primary" accessibilityRole="header">
            Join a shop&apos;s team
          </Text>
          <Text className="text-body-lg text-text-secondary">Sign in first. Then the owner approves you.</Text>
        </View>
        {token ? (
          <View className="flex-row">
            <StatusChip tone="success" icon="circle-check" label="Invite ready" />
          </View>
        ) : null}
        <View className="gap-3">
          <PrimaryButton label="Sign in" onPress={() => router.push("/(auth)/login")} />
          <SecondaryButton label="Create a login" onPress={() => router.push("/(auth)/join-account")} />
        </View>
      </FormScrollView>
    );
  }

  const live = (invites ?? []).filter((invite) => inviteTimeLeft(invite.expiresAt) != null);
  // One yellow: the invite in hand, else the first found invite, else Scan.
  const yellowOnToken = Boolean(token);
  const yellowOnInvite = !token && live.length > 0;

  return (
    <FormScrollView contentClassName="gg-page gap-6 pb-10 pt-6">
      <Text className="text-h1 text-text-primary" accessibilityRole="header">
        Join a shop&apos;s team
      </Text>

      {problem ? <ErrorNotice message={problem} /> : null}

      {token ? (
        <View className="gg-card gap-3">
          <StatusChip tone="success" icon="circle-check" label="Invite ready" />
          <PrimaryButton
            label={busy ? "Joining…" : "Join"}
            disabled={busy}
            onPress={() => void claim({ token })}
          />
        </View>
      ) : null}

      {invites == null ? (
        <SkeletonBlock className="h-24 w-full rounded-card" />
      ) : live.length ? (
        <View className="gap-3">
          {live.map((invite, index) => (
            <View key={invite.id} className="gg-card gap-3">
              <View className="flex-row items-center gap-3">
                <View className="h-11 w-11 items-center justify-center rounded-pill bg-surface-variant">
                  <Store size={20} color={colors.textPrimary} aria-hidden />
                </View>
                <View className="min-w-0 flex-1">
                  <Text className="text-body-lg font-medium text-text-primary" numberOfLines={2}>
                    {invite.shop?.name || "A print shop"}
                  </Text>
                  <Text className="text-caption text-text-muted">{invite.identity}</Text>
                </View>
                <StatusChip tone="neutral" icon="clock" label={inviteTimeLeft(invite.expiresAt) ?? ""} />
              </View>
              {yellowOnInvite && index === 0 ? (
                <PrimaryButton
                  label={busy ? "Joining…" : "Join"}
                  disabled={busy}
                  onPress={() => void claim({ inviteId: invite.id })}
                />
              ) : (
                <SecondaryButton
                  label="Join"
                  accessibilityLabel={`Join ${invite.shop?.name || "this shop"}`}
                  disabled={busy}
                  onPress={() => void claim({ inviteId: invite.id })}
                />
              )}
            </View>
          ))}
        </View>
      ) : null}

      <View className="gap-3">
        {yellowOnToken || yellowOnInvite ? (
          <SecondaryButton label="Scan the owner's QR" onPress={() => router.push("/scan-team")} />
        ) : (
          <Pressable
            onPress={() => router.push("/scan-team")}
            accessibilityRole="button"
            accessibilityLabel="Scan the owner's QR"
            className="gg-card items-center gap-3 py-8"
            style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
          >
            <QrCode size={48} color={colors.textPrimary} aria-hidden />
            <Text className="text-h3 text-text-primary">Scan the owner&apos;s QR</Text>
          </Pressable>
        )}
      </View>

      <View className="gap-2">
        <Text className="text-caption text-text-muted">Or paste the owner&apos;s link</Text>
        <TextField
          value={pasted}
          onChange={setPasted}
          kind="text"
          placeholder="https://…/join-team#token=…"
          accessibilityLabel="Team invite link"
          returnKeyType="go"
          onSubmit={claimPasted}
        />
        {pasted.trim() ? (
          <SecondaryButton label="Join with link" disabled={busy} onPress={claimPasted} />
        ) : null}
      </View>

      {identity.kind !== "supplier" ? (
        <Pressable
          onPress={() => void logout()}
          accessibilityRole="button"
          className="gg-touch items-center justify-center"
        >
          <Text className="text-button text-text-muted">Sign out</Text>
        </Pressable>
      ) : null}
    </FormScrollView>
  );
}
