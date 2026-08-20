import { useUser } from "@clerk/expo";
import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";

import { BusyOverlay } from "@/components/BusyOverlay";
import { EmptyState } from "@/components/EmptyState";
import { FormScrollView } from "@/components/FormScrollView";
import { JobTicketCode } from "@/components/JobTicketCode";
import { PrimaryButton } from "@/components/PrimaryButton";
import { SecondaryButton } from "@/components/SecondaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import {
  confirmEmailChange,
  emailKeptByGridgo,
  EMAIL_ALREADY_REGISTERED,
  newEmailProblem,
  resendEmailCode,
  startEmailChange,
  type ClerkEmailAddress,
} from "@/lib/clerkIdentity";
import { useSession } from "@/store/session";

/**
 * Moving the address a shop signs in with.
 *
 * Its own screen because it is a commitment with steps, not a field: an address
 * is claimed, a code is answered, and only then does anything change. Doing it
 * inline on the shop's details would also put a second yellow action on a
 * screen that already has one, and the yellow here has to be the step the shop
 * is actually on.
 *
 * The ending that this screen exists for is the one nobody expects. Clerk and
 * GRIDGO hold the address separately: Clerk can accept it while GRIDGO keeps
 * its own, because GRIDGO will not take an address another shop's record
 * already holds. That is neither a failure to retry nor a success to celebrate,
 * so it is said in full and sent to Operations — the one thing this screen must
 * never do is quietly leave two different addresses on one shop and say
 * "saved".
 */
export default function ChangeEmailScreen() {
  const { user: clerkUser } = useUser();
  const refresh = useSession((s) => s.refresh);
  const currentEmail = useSession((s) => s.user?.email) ?? "";

  const [address, setAddress] = useState("");
  const [pending, setPending] = useState<ClerkEmailAddress | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  /** Clerk moved and GRIDGO did not. A notice, deliberately not an error. */
  const [split, setSplit] = useState<string | null>(null);

  async function send() {
    if (!clerkUser) return;
    const wrong = newEmailProblem(address, currentEmail);
    if (wrong) {
      setProblem(wrong);
      return;
    }

    setBusy(true);
    setProblem(null);
    const outcome = await startEmailChange(clerkUser, address);
    setBusy(false);

    if (outcome.status === "ok") {
      setPending(outcome.value);
      setCode("");
      return;
    }
    setProblem(
      outcome.status === "already_registered" ? EMAIL_ALREADY_REGISTERED : outcome.message,
    );
  }

  async function resend() {
    if (!pending) return;
    setBusy(true);
    setProblem(null);
    const outcome = await resendEmailCode(pending);
    setBusy(false);
    if (outcome.status === "failed") setProblem(outcome.message);
  }

  async function confirm() {
    if (!clerkUser || !pending) return;
    setBusy(true);
    setProblem(null);
    const outcome = await confirmEmailChange(clerkUser, pending, code);

    if (outcome.status !== "ok") {
      setBusy(false);
      setProblem(
        outcome.status === "already_registered" ? EMAIL_ALREADY_REGISTERED : outcome.message,
      );
      return;
    }

    // GRIDGO copies the sign-in's primary address onto the account when it
    // reads it — unless another shop's record already holds it, in which case
    // it leaves both alone. Reading the account back is the only way to find
    // out which of those happened.
    await refresh();
    setBusy(false);

    const gridgoEmail = useSession.getState().user?.email ?? "";
    if (gridgoEmail.trim().toLowerCase() === outcome.value.trim().toLowerCase()) {
      router.back();
      return;
    }
    setSplit(emailKeptByGridgo(outcome.value, gridgoEmail || "the address it had"));
  }

  if (!clerkUser) {
    return (
      <View className="gg-screen gg-page justify-center">
        <EmptyState
          title="Your sign-in is not open on this phone"
          body="GRIDGO could not reach the account behind this shop. Go back, then open your shop details again."
          actionLabel="Go back"
          onAction={() => router.back()}
        />
      </View>
    );
  }

  /*
   * The split ending takes the whole screen.
   *
   * A shop that has just answered a code is expecting the screen to close, so
   * a sentence tucked under a form it has stopped reading is a sentence it will
   * not read. This replaces the form, because there is nothing left to do here
   * and the next move belongs to Operations.
   */
  if (split) {
    return (
      <View className="gg-screen">
        <FormScrollView contentClassName="gg-page pb-16 pt-4">
          <View className="gap-3">
            <Text className="text-h2 text-text-primary">Your sign-in moved. GRIDGO’s copy did not.</Text>
            <Text className="text-body text-text-secondary">{split}</Text>
          </View>
          <View className="mt-8">
            <SecondaryButton label="Back to your shop details" onPress={() => router.back()} />
          </View>
        </FormScrollView>
      </View>
    );
  }

  if (pending) {
    return (
      <View className="gg-screen">
        <FormScrollView contentClassName="gg-page pb-16 pt-4">
          <JobTicketCode
            title="Check your new email"
            email={pending.emailAddress}
            value={code}
            onChange={setCode}
            onVerify={() => void confirm()}
            onResend={() => void resend()}
            verifyLabel="Use this address"
            resendLabel="Send another code"
            busy={busy}
            error={problem}
          />
          <View className="mt-6">
            <SecondaryButton
              label="Use a different address"
              disabled={busy}
              onPress={() => {
                setPending(null);
                setCode("");
                setProblem(null);
              }}
            />
          </View>
        </FormScrollView>

        <BusyOverlay visible={busy} label="Checking that code…" />
      </View>
    );
  }

  return (
    <View className="gg-screen">
      <FormScrollView contentClassName="gg-page pb-16 pt-4">
        <View className="gap-2">
          <Text className="text-h2 text-text-primary">Change your sign-in email</Text>
          <Text className="text-body text-text-secondary">
            {currentEmail
              ? `You sign in to GRIDGO with ${currentEmail}. Enter the address you want to use instead and GRIDGO sends it a six-digit code.`
              : "Enter the address you want to sign in with and GRIDGO sends it a six-digit code."}
          </Text>
        </View>

        <View className="mt-8">
          <FieldShell
            label="New email address"
            hint="Somewhere you can open right now — the code arrives in a moment."
            error={problem}
          >
            <TextField
              value={address}
              onChange={(value) => {
                setAddress(value);
                setProblem(null);
              }}
              kind="email"
              placeholder="you@yourshop.ph"
              accessibilityLabel="New email address"
              editable={!busy}
            />
          </FieldShell>
        </View>

        <View className="mt-8">
          <PrimaryButton
            label={busy ? "Sending…" : "Send the code"}
            disabled={busy}
            onPress={() => void send()}
          />
        </View>

        <Text className="mt-6 text-caption text-text-muted">
          Nothing changes until the code is answered. Your jobs, earnings and board stay exactly
          where they are.
        </Text>
      </FormScrollView>

      <BusyOverlay visible={busy} label="Sending your code…" />
    </View>
  );
}
