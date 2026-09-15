import { useReadVersion } from "@/hooks/useReadVersion";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { Trash2 } from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { PayoutQrPlate } from "@/components/PayoutQrPlate";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { FieldShell } from "@/components/controls/FieldShell";
import { OptionList } from "@/components/controls/OptionList";
import { TextField } from "@/components/controls/TextField";
import type { PayoutAccount } from "@/lib/api";
import {
  chooseQrPicture,
  draftFromAccount,
  hasPayoutChanges,
  isWallet,
  loadPayoutAccount,
  PAYOUT_NOT_OPEN_YET,
  PAYOUT_STALE,
  payoutPatch,
  payoutProblems,
  PROVIDER_OPTIONS,
  savePayoutAccount,
  sendQrPicture,
  takeQrPhoto,
  type PayoutDraft,
  type PayoutField,
  type PayoutProblems,
  type PickedQr,
} from "@/lib/payoutAccount";
import { askConfirm } from "@/store/sheets";
import { useThemeColors } from "@/hooks/useTheme";

/**
 * Where the shop gets paid.
 *
 * Reached from Money on Account. It opens on the plate rather than on a
 * field, because the plate is the thing Operations actually uses: when a job
 * is done, a person opens a wallet app and scans it, the way a customer at
 * the counter would. Everything under the plate is how a person checks they
 * scanned the right shop — which wallet, whose name comes back, the number.
 *
 * The picture goes to GRIDGO as soon as it is picked, so the shop sees the
 * real plate rather than a promise of one, but nothing is bound to the
 * account until Save. A photo taken and then abandoned is never what
 * Operations scans.
 *
 * Nothing is drawn to press until something has actually changed — a
 * disabled yellow button is not a state — and a save carries the version the
 * account was read at, so a change made elsewhere is offered, not overwritten.
 */
export default function PayoutAccountScreen() {
  const colors = useThemeColors();
  const [state, setState] = useState<{ account: PayoutAccount | null; draft: PayoutDraft } | null>(null);
  const account = state?.account ?? null;
  const draft = state?.draft ?? null;
  const beginRead = useReadVersion();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [refusals, setRefusals] = useState<PayoutProblems>({});
  const [loadProblem, setLoadProblem] = useState<{
    kind: "not_open_yet" | "failed";
    message: string;
  } | null>(null);
  const [saveNotice, setSaveNotice] = useState<{ message: string; reloadable: boolean } | null>(null);

  const load = useCallback(async (adoptDraft: boolean) => {
    const current = beginRead();
    setLoading(true);
    const outcome = await loadPayoutAccount();
    if (!current()) return;
    setLoading(false);

    if (outcome.status === "ok") {
      setState((previous) =>
        adoptDraft || !previous
          ? { account: outcome.value, draft: draftFromAccount(outcome.value) }
          : previous,
      );
      setLoadProblem(null);
      if (adoptDraft) {
        setSaveNotice(null);
        setRefusals({});
        setShowProblems(false);
      }
      return;
    }

    setLoadProblem(
      outcome.status === "not_open_yet"
        ? { kind: "not_open_yet", message: PAYOUT_NOT_OPEN_YET }
        : { kind: "failed", message: outcome.status === "failed" ? outcome.message : PAYOUT_STALE },
    );
  }, [beginRead]);

  useLiveRefresh(["identity"], () => load(false));

  useFocusEffect(
    useCallback(() => {
      void load(false);
    }, [load]),
  );

  const problems = draft ? payoutProblems(draft) : {};
  const changed = draft ? hasPayoutChanges(account, draft) : false;

  function fieldError(field: PayoutField): string | null {
    return refusals[field] ?? (showProblems ? (problems[field] ?? null) : null);
  }

  function edit(patch: Partial<PayoutDraft>) {
    setState((current) => (current ? { ...current, draft: { ...current.draft, ...patch } } : current));
    setRefusals({});
  }

  async function pick(how: "camera" | "gallery") {
    const outcome = how === "camera" ? await takeQrPhoto() : await chooseQrPicture();
    if (!outcome.ok) {
      if (!outcome.cancelled) setRefusals({ qr: outcome.message });
      return;
    }
    await send(outcome.document);
  }

  async function send(picked: PickedQr) {
    edit({ qr: { fileId: null, localUri: picked.uri, removed: false } });
    setSending(true);
    const sent = await sendQrPicture(picked);
    setSending(false);
    if (sent.status === "ok") {
      edit({ qr: { fileId: sent.fileId, localUri: picked.uri, removed: false } });
      return;
    }
    // Back to whatever GRIDGO still holds; the failed picture is not a plate.
    edit({ qr: { fileId: account?.qr?.fileId ?? null, localUri: null, removed: false } });
    setRefusals({ qr: sent.status === "not_open_yet" ? PAYOUT_NOT_OPEN_YET : sent.message });
  }

  async function removePlate() {
    const ok = await askConfirm({
      question: "Take down your payout QR?",
      consequence:
        "Operations will have only the name and number below to pay you with until you add a new picture.",
      confirmLabel: "Take it down",
      cancelLabel: "Keep it",
      destructive: true,
    });
    if (!ok) return;
    edit({ qr: { fileId: null, localUri: null, removed: true } });
  }

  async function save() {
    if (!draft) return;
    if (Object.keys(payoutProblems(draft)).length) {
      setShowProblems(true);
      return;
    }
    const patch = payoutPatch(account, draft);
    if (!Object.keys(patch).length) return;

    beginRead();
    setLoading(false);
    setSaving(true);
    setSaveNotice(null);
    setRefusals({});
    const outcome = await savePayoutAccount(account?.version ?? null, patch);
    setSaving(false);

    if (outcome.status === "ok") {
      setState({ account: outcome.value, draft: draftFromAccount(outcome.value) });
      router.back();
      return;
    }
    if (outcome.status === "stale") {
      setSaveNotice({ message: PAYOUT_STALE, reloadable: true });
      return;
    }
    if (outcome.status === "not_open_yet") {
      setSaveNotice({ message: PAYOUT_NOT_OPEN_YET, reloadable: false });
      return;
    }
    if (outcome.field) {
      setRefusals({ [outcome.field]: outcome.message });
      return;
    }
    setSaveNotice({ message: outcome.message, reloadable: false });
  }

  const plateFileId = draft?.qr.removed ? null : draft?.qr.fileId ?? null;
  const plateLocalUri = draft?.qr.removed ? null : draft?.qr.localUri ?? null;
  const hasPlate = Boolean(plateFileId || plateLocalUri);
  const plateUnsaved = Boolean(draft && !draft.qr.removed && draft.qr.fileId && draft.qr.fileId !== account?.qr?.fileId);
  const wallet = isWallet(draft?.provider ?? null);

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-16 pt-4">
        {draft ? (
          <>
            {/*
              The plate leads. It is what Operations points a phone at, and a
              shop recognises its own counter plate faster than it reads a
              wallet name.
            */}
            <PayoutQrPlate
              fileId={plateFileId}
              localUri={plateLocalUri}
              sending={sending}
              caption={
                plateUnsaved
                  ? "Sent to GRIDGO. Save below to make it the one Operations scans."
                  : hasPlate
                    ? "The QR Operations scans to send your payout."
                    : "The receiving QR from your wallet app, or a clear photo of the plate on your counter."
              }
            />

            <View className="mt-4 flex-row items-center gap-3">
              <View className="flex-1">
                <SecondaryButton
                  label={hasPlate ? "Retake photo" : "Take photo"}
                  disabled={sending || saving}
                  onPress={() => void pick("camera")}
                />
              </View>
              <View className="flex-1">
                <SecondaryButton
                  label={hasPlate ? "Choose another" : "Choose picture"}
                  disabled={sending || saving}
                  onPress={() => void pick("gallery")}
                />
              </View>
              {hasPlate ? (
                <Pressable
                  onPress={() => void removePlate()}
                  disabled={sending || saving}
                  accessibilityRole="button"
                  accessibilityLabel="Take down your payout QR"
                  className="gg-touch items-center justify-center"
                  style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
                >
                  <Trash2 size={20} color={colors.textMuted} strokeWidth={2} />
                </Pressable>
              ) : null}
            </View>

            {fieldError("qr") ? (
              <View className="mt-3">
                <ErrorNotice message={fieldError("qr") ?? ""} />
              </View>
            ) : null}
          </>
        ) : null}

        <View className="mt-8 gap-2">
          <Text className="text-h2 text-text-primary">Wallet and name</Text>
          <Text className="text-body text-text-secondary">
            How Operations checks the scan reached you, and what they use if the QR will not read.
          </Text>
        </View>

        {loading && !draft ? (
          <View className="mt-8">
            <PayoutSkeleton />
          </View>
        ) : null}

        {loadProblem && !draft ? (
          <View className="mt-8">
            <EmptyState
              title={
                loadProblem.kind === "not_open_yet"
                  ? "Payout accounts are not open yet"
                  : "Your payout account is not reachable"
              }
              body={loadProblem.message}
              actionLabel={loadProblem.kind === "not_open_yet" ? "Check again" : "Try again"}
              onAction={() => void load(true)}
            />
          </View>
        ) : null}

        {loadProblem && draft ? (
          <View className="mt-8">
            <ErrorNotice message={loadProblem.message} onRetry={() => void load(true)} />
          </View>
        ) : null}

        {draft ? (
          <>
            <View className="mt-8 gap-6">
              <FieldShell label="Paid through" error={fieldError("provider")}>
                <OptionList
                  options={PROVIDER_OPTIONS}
                  value={draft.provider}
                  onChange={(provider) => edit({ provider })}
                  accessibilityLabel="Paid through"
                />
              </FieldShell>

              <FieldShell
                label="Account name"
                hint="The name the wallet shows Operations after the scan, so they know it is you."
                error={fieldError("accountName")}
              >
                <TextField
                  value={draft.accountName}
                  onChange={(accountName) => edit({ accountName })}
                  kind="name"
                  placeholder="Ben S."
                  accessibilityLabel="Account name"
                  editable={!saving}
                />
              </FieldShell>

              <FieldShell
                label={wallet ? "Wallet mobile number" : "Account number"}
                hint={
                  wallet
                    ? "The number the wallet is registered to. Optional when your QR reads well."
                    : "What Operations types if the QR will not read. Optional."
                }
                error={fieldError("accountNumber")}
              >
                <TextField
                  value={draft.accountNumber}
                  onChange={(accountNumber) => edit({ accountNumber })}
                  kind={wallet ? "phone" : "text"}
                  placeholder={wallet ? "0917 123 4567" : "1234 5678 90"}
                  accessibilityLabel={wallet ? "Wallet mobile number" : "Account number"}
                  editable={!saving}
                />
              </FieldShell>

              {draft.provider === "bank" || draft.provider === "other" ? (
                <FieldShell
                  label={draft.provider === "bank" ? "Bank" : "Wallet"}
                  hint={
                    draft.provider === "bank"
                      ? "As it appears on your account, like BPI or BDO."
                      : "The wallet's name, so Operations opens the right app."
                  }
                  error={fieldError("institution")}
                >
                  <TextField
                    value={draft.institution}
                    onChange={(institution) => edit({ institution })}
                    kind="text"
                    placeholder={draft.provider === "bank" ? "BPI" : "ShopeePay"}
                    accessibilityLabel={draft.provider === "bank" ? "Bank" : "Wallet"}
                    editable={!saving}
                  />
                </FieldShell>
              ) : null}
            </View>

            {saveNotice ? (
              <View className="mt-6">
                <ErrorNotice
                  message={saveNotice.message}
                  onRetry={saveNotice.reloadable ? () => void load(true) : undefined}
                  retryLabel="Load the latest"
                />
              </View>
            ) : null}

            <View className="mt-8">
              {changed ? (
                <PrimaryButton
                  label={saving ? "Saving…" : account ? "Save changes" : "Save payout account"}
                  disabled={saving || sending}
                  onPress={() => void save()}
                />
              ) : (
                <Text className="text-caption text-text-muted">
                  {account
                    ? "This is where GRIDGO sends your payouts. Change something to save it."
                    : "Choose a wallet and add your name to save where you get paid."}
                </Text>
              )}
            </View>
          </>
        ) : null}
      </FormScrollView>

      <BusyOverlay visible={saving} label="Saving where you get paid…" />
    </View>
  );
}

function PayoutSkeleton() {
  return (
    <View className="gap-6" accessibilityRole="progressbar" accessibilityLabel="Loading your payout account">
      {[0, 1, 2].map((row) => (
        <View key={row} className="gap-2">
          <SkeletonBlock className="h-4 w-28" />
          <SkeletonBlock className="h-12 w-full" />
          <SkeletonBlock className="h-4 w-3/4" />
        </View>
      ))}
    </View>
  );
}
