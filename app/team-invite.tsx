import * as Clipboard from "expo-clipboard";
import { router } from "expo-router";
import { Check, Copy, Link2, Mail, Phone, QrCode, RefreshCw, type LucideIcon } from "lucide-react-native";
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
import { humanizeApiError, offlineMessage, replaceInviteErrorMessage } from "@/lib/apiErrors";
import { openInMessenger } from "@/lib/messengerShare";
import {
  inviteTimeLeft,
  joinTeamLink,
  normalizeInviteIdentity,
  type CreatedInvite,
  type InviteKind,
} from "@/lib/shopTeam";
import { askConfirm } from "@/store/sheets";

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
  const [replacing, setReplacing] = useState(false);
  /** Said under the issued code: why New code failed, or that Messenger was not there. */
  const [issuedNote, setIssuedNote] = useState<{ tone: "error" | "info"; text: string } | null>(null);

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

  async function sendInMessenger(url: string) {
    setIssuedNote(null);
    if (await openInMessenger(url)) return;
    const copiedLink = await copy(url).then(
      () => true,
      () => false,
    );
    setIssuedNote({
      tone: "info",
      text: copiedLink
        ? "Messenger did not open. Link copied — paste it in any chat."
        : "Messenger did not open. Copy the link above and paste it in any chat.",
    });
  }

  /** Swap the shown code only once GRIDGO has revoked the old one and issued this. */
  async function newCode(invite: CreatedInvite) {
    const confirmed = await askConfirm({
      question:
        kind === "qr"
          ? "Make a new QR code?"
          : kind === "link"
            ? "Make a new link?"
            : `Make a new invite for ${invite.invite.identity ?? "this person"}?`,
      consequence:
        kind === "qr" || kind === "link"
          ? "The current code stops working right away. Anyone who has it will need the new one."
          : "The current invite stops working right away. It goes to the same person; share the new link with them.",
      confirmLabel: "New code",
      cancelLabel: "Keep this one",
    });
    if (!confirmed) return;
    setIssuedNote(null);
    setReplacing(true);
    try {
      const next = await api.replaceShopInvite(invite.invite.id);
      setCreated((all) => ({ ...all, [kind]: next }));
      setCopied(false);
    } catch (e) {
      setIssuedNote({ tone: "error", text: replaceInviteErrorMessage(e) });
    } finally {
      setReplacing(false);
    }
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
          setIssuedNote(null);
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
            <Pressable
              onPress={() => void newCode(current)}
              disabled={replacing}
              accessibilityRole="button"
              accessibilityState={{ disabled: replacing, busy: replacing }}
              className="gg-touch flex-row items-center justify-center gap-1.5 px-2"
            >
              <RefreshCw size={16} color={colors.textPrimary} aria-hidden />
              <Text className="text-button text-text-primary">{replacing ? "Making new code…" : "New code"}</Text>
            </Pressable>
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
          {issuedNote ? (
            issuedNote.tone === "error" ? (
              <View className="w-full">
                <ErrorNotice message={issuedNote.text} />
              </View>
            ) : (
              <Text className="text-center text-body text-text-secondary" accessibilityRole="alert">
                {issuedNote.text}
              </Text>
            )
          ) : null}
          <View className="w-full gap-3">
            <SecondaryButton label="Send in Messenger" onPress={() => void sendInMessenger(link)} />
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
