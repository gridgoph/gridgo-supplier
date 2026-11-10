import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { EmptyState } from "@/components/EmptyState";
import { FlowScreen } from "@/components/FlowScreen";
import { PlayOptInTrack } from "@/components/PlayOptInTrack";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { SkeletonBlock } from "@/components/Skeleton";
import { CheckboxRow } from "@/components/controls/CheckboxRow";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import { checkGmail, currentOptInStep, optInSteps } from "@/lib/playOptIn";
import { usePlayOptIn } from "@/store/playOptIn";
import { useSession } from "@/store/session";

/**
 * Become a Google Play tester (`lib/playOptIn.ts`), opened from the Home card
 * or the `play_optin` push. Confirm the Gmail used on Play, join the tester
 * group when GRIDGO cannot add it, open Play's testing page to tap "Become a
 * tester", then install GRIDGO from Play — the APK cannot count. One yellow
 * action at a time, for the step the shop is on.
 */
export default function PlayOptInScreen() {
  const userId = useSession((s) => s.user?.id ?? null);
  const owner = usePlayOptIn((s) => s.owner);
  const state = usePlayOptIn((s) => (owner === userId ? s.state : null));
  const loadError = usePlayOptIn((s) => s.loadError);
  const progress = usePlayOptIn((s) => s.progress);

  const [loading, setLoading] = useState(true);
  const [typed, setTyped] = useState<string | null>(null);
  const [googleAccount, setGoogleAccount] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const tapped = useRef(false);

  async function load() {
    setLoading(true);
    await usePlayOptIn.getState().load(userId);
    setLoading(false);
  }

  useEffect(() => {
    void usePlayOptIn.getState().load(userId).then(() => setLoading(false));
    // Once per visit; Try again calls load() again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // GRIDGO's suggestion fills the field until the shop types its own.
  const email = typed ?? state?.gmailSuggestion ?? "";
  const setEmail = setTyped;

  // The entry counts as soon as GRIDGO has this install — before any typing,
  // so a shop that stops at the Gmail is still seen by Operations.
  useEffect(() => {
    if (!state?.show || tapped.current) return;
    tapped.current = true;
    usePlayOptIn.getState().tapped();
  }, [state?.show]);

  if (loading && !state) {
    return (
      <View className="gg-screen gg-page pt-4" accessibilityRole="progressbar" accessibilityLabel="Loading the tester steps">
        <View className="gap-3">
          <SkeletonBlock className="h-7 w-2/3" />
          <SkeletonBlock className="h-5 w-1/2" />
        </View>
        <View className="mt-8 gap-6">
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-8 w-full" />
          <SkeletonBlock className="h-8 w-full" />
        </View>
      </View>
    );
  }

  if (!state) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="The tester steps did not load"
          body={loadError ?? "Check this phone's connection, then try again."}
          actionLabel="Try again"
          onAction={() => void load()}
        />
      </View>
    );
  }

  const goHome = () => router.replace("/(tabs)/home");

  if (state.optedIn || state.step === "opted_in") {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="You're a tester"
          body="Thank you. Your daily check-in is on Home."
          actionLabel="Go to Home"
          onAction={goHome}
        />
      </View>
    );
  }

  if (!state.show) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="Nothing to do here"
          body="Testing on Google Play is not open for this phone."
          actionLabel="Go to Home"
          onAction={goHome}
        />
      </View>
    );
  }

  const confirmed = state.step !== "confirm_gmail" && !editing;
  const view = confirmed ? state : { ...state, step: "confirm_gmail" as const };
  const step = currentOptInStep(view, progress);
  const steps = optInSteps(view, progress);
  const check = checkGmail(email, googleAccount);
  // Asked only for an address that is not a Gmail: Play admits Google accounts.
  const asserted = checkGmail(email, false);
  const askAccount = !asserted.ok && asserted.needsGoogleAccount;
  const confirmedGmail = state.gmailSuggestion ?? email.trim();

  async function run(action: () => Promise<string | null>) {
    if (busy) return;
    setBusy(true);
    setActionError(null);
    const error = await action();
    setActionError(error);
    setBusy(false);
  }

  async function confirm() {
    if (!check.ok) {
      setShowErrors(true);
      return;
    }
    await run(async () => {
      const error = await usePlayOptIn.getState().confirmGmail(email, check.googleAccount);
      if (!error) setEditing(false);
      return error;
    });
  }

  const action =
    step === "gmail"
      ? { label: busy ? "Confirming…" : "Confirm", onPress: () => void confirm() }
      : step === "group"
        ? { label: "Join group", onPress: () => void run(() => usePlayOptIn.getState().openGroup()) }
        : step === "optin"
          ? { label: "Become a tester", onPress: () => void run(() => usePlayOptIn.getState().openOptIn()) }
          : { label: "Install from Play", onPress: () => void usePlayOptIn.getState().openPlayStore() };

  // Each step's way back, for a page closed too early.
  const again =
    step === "optin" && state.groupMode === "link"
      ? { label: "Open the group again", onPress: () => void run(() => usePlayOptIn.getState().openGroup()) }
      : step === "install"
        ? { label: "Open the tester page again", onPress: () => void run(() => usePlayOptIn.getState().openOptIn()) }
        : null;

  const hint =
    step === "group"
      ? `Join with ${confirmedGmail}.`
      : step === "optin"
        ? `Sign in as ${confirmedGmail}, then tap Become a tester.`
        : step === "install"
          ? "Then open GRIDGO from Play. Only the Play version counts."
          : null;

  return (
    <FlowScreen
      loading={false}
      error={null}
      onRetry={() => void load()}
      title="Help us launch GRIDGO on Play"
      actionError={actionError}
      footer={
        <>
          <PrimaryButton label={action.label} disabled={busy} onPress={action.onPress} />
          {again ? <SecondaryButton label={again.label} disabled={busy} onPress={again.onPress} /> : null}
        </>
      }
    >
      <PlayOptInTrack
        steps={steps}
        // Opening a link is all this phone knows; it never claims the shop joined.
        details={confirmed ? { gmail: confirmedGmail, group: "Opened", optin: "Opened" } : {}}
        backTo={
          confirmed
            ? {
                key: "gmail",
                label: "Change",
                onPress: () => {
                  setActionError(null);
                  setEditing(true);
                },
              }
            : undefined
        }
      />

      {step === "gmail" ? (
        <View className="gap-1">
          <FieldShell
            label="Gmail on Google Play"
            error={showErrors && !check.ok ? check.error : null}
          >
            <TextField
              value={email}
              onChange={(value) => {
                setEmail(value);
                setActionError(null);
              }}
              placeholder="you@gmail.com"
              accessibilityLabel="Gmail on Google Play"
              kind="email"
              returnKeyType="done"
              onSubmit={() => void confirm()}
              editable={!busy}
            />
          </FieldShell>
          {askAccount ? (
            <CheckboxRow
              checked={googleAccount}
              onChange={setGoogleAccount}
              label="This is my Google account"
              hint={showErrors && !check.ok ? "Play admits Google accounts only." : undefined}
            />
          ) : null}
        </View>
      ) : null}

      {hint ? <Text className="text-body text-text-secondary">{hint}</Text> : null}
    </FlowScreen>
  );
}
