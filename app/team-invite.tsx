import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Check, Copy, Link2, Mail, Phone, QrCode, type LucideIcon } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Share, Text, View } from "react-native";

import { CropMarkFrame } from "@/components/CropMarkFrame";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { StatusChip } from "@/components/StatusChip";
import { SegmentedControl } from "@/components/controls/SegmentedControl";
import { TextField } from "@/components/controls/TextField";
import { TeamQr } from "@/components/team/TeamQr";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import { humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  inviteTimeLeft,
  joinTeamLink,
  normalizeInviteIdentity,
  type CreatedInvite,
  type InviteKind,
} from "@/lib/shopTeam";

const METHODS = [
  { value: "qr", label: "QR" },
  { value: "link", label: "Link" },
  { value: "email", label: "Email" },
  { value: "phone", label: "Phone" },
] as const satisfies readonly { value: InviteKind; label: string }[];

const ICON: Record<InviteKind, LucideIcon> = { qr: QrCode, link: Link2, email: Mail, phone: Phone };

/** One line under each method: what the new person does. */
const HOW: Record<InviteKind, string> = {
  qr: "They scan it in GRIDGO Supplier.",
  link: "Send it in any chat.",
  email: "They sign in with this email to join.",
  phone: "They sign in with this number to join.",
};

const ACTION: Record<InviteKind, string> = {
  qr: "Show QR code",
  link: "Share link",
  email: "Invite",
  phone: "Invite",
};

/**
 * Add staff, three ways: a QR the new person scans off this phone, a link
 * sent in any chat, or their email or phone, found when they sign in.
 *
 * GRIDGO sends no message itself, so every method ends with something the
 * Owner can show or share. Each invite works once, for 48 hours — said by the
 * clock chip, not a paragraph — and the person still waits for approval.
 */
export default function TeamInviteScreen() {
  const colors = useThemeColors();
  const [kind, setKind] = useState<InviteKind>("qr");
  const [identity, setIdentity] = useState("");
  const [created, setCreated] = useState<Partial<Record<InviteKind, CreatedInvite>>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const current = created[kind];
  const link = current ? joinTeamLink(current.token) : null;
  const Icon = ICON[kind];

  async function share(url: string) {
    try {
      await Share.share({ message: `Join my shop's team on GRIDGO: ${url}` });
    } catch {
      await copy(url);
    }
  }

  async function copy(url: string) {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function create() {
    setProblem(null);
    let target: string | undefined;
    if (kind === "email" || kind === "phone") {
      const normalized = normalizeInviteIdentity(kind, identity);
      if (!normalized) {
        setProblem(kind === "email" ? "Check the email address." : "Check the number. It looks like 0917 123 4567.");
        return;
      }
      target = normalized;
    }
    setBusy(true);
    try {
      const made = await api.createShopInvite(kind, target);
      setCreated((all) => ({ ...all, [kind]: made }));
      if (kind === "link") await share(joinTeamLink(made.token));
    } catch (e) {
      setProblem(humanizeApiError(e, offlineMessage("make this invite")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <FormScrollView contentClassName="gg-page gap-6 pb-10 pt-4">
      <SegmentedControl
        options={METHODS}
        value={kind}
        onChange={(next) => {
          setKind(next);
          setProblem(null);
          setIdentity("");
        }}
        accessibilityLabel="How to invite"
      />

      {current && link ? (
        <View className="items-center gap-5">
          {kind === "qr" ? (
            <CropMarkFrame>
              <TeamQr value={link} />
            </CropMarkFrame>
          ) : (
            <View className="h-20 w-20 items-center justify-center rounded-pill border border-success">
              <Check size={36} color={colors.success} aria-hidden />
            </View>
          )}
          <View className="items-center gap-2">
            <Text className="text-center text-h3 text-text-primary">
              {kind === "qr" ? "Scan to join" : current.invite.identity || "Link ready"}
            </Text>
            <View className="flex-row flex-wrap justify-center gap-2">
              <StatusChip
                tone="neutral"
                icon="clock"
                label={`${inviteTimeLeft(current.invite.expiresAt) ?? "48h"} left`}
              />
              <StatusChip tone="neutral" icon="circle-check" label="Works once" />
            </View>
          </View>
          <View className="w-full flex-row items-center gap-2 rounded-field border border-outline bg-surface px-4 py-2">
            <Text className="min-w-0 flex-1 text-caption text-text-muted" numberOfLines={1} selectable>
              {link}
            </Text>
            <Pressable
              onPress={() => void copy(link)}
              accessibilityRole="button"
              accessibilityLabel={copied ? "Link copied" : "Copy link"}
              className="gg-touch h-11 w-11 items-center justify-center"
            >
              {copied ? (
                <Check size={18} color={colors.success} aria-hidden />
              ) : (
                <Copy size={18} color={colors.textPrimary} aria-hidden />
              )}
            </Pressable>
          </View>
          <View className="w-full gap-3">
            <SecondaryButton label={kind === "link" ? "Share again" : "Share link"} onPress={() => void share(link)} />
            <SecondaryButton label="Done" onPress={() => router.back()} />
          </View>
        </View>
      ) : (
        <View className="gap-5">
          <View className="items-center gap-3 py-4">
            <View className="h-20 w-20 items-center justify-center rounded-pill bg-surface-variant">
              <Icon size={36} color={colors.textPrimary} aria-hidden />
            </View>
            <Text className="text-center text-body-lg text-text-secondary">{HOW[kind]}</Text>
          </View>
          {kind === "email" || kind === "phone" ? (
            <TextField
              value={identity}
              onChange={setIdentity}
              kind={kind === "email" ? "email" : "phone"}
              placeholder={kind === "email" ? "sam@example.com" : "0917 123 4567"}
              accessibilityLabel={kind === "email" ? "Their email" : "Their mobile number"}
              returnKeyType="done"
              onSubmit={() => void create()}
            />
          ) : null}
          {problem ? <ErrorNotice message={problem} /> : null}
          <PrimaryButton label={busy ? "Making invite…" : ACTION[kind]} disabled={busy} onPress={() => void create()} />
        </View>
      )}
    </FormScrollView>
  );
}
