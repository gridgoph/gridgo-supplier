import { useAuth, useClerk, useSignIn, useSignUp } from "@clerk/expo";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { JobTicketCode } from "@/components/JobTicketCode";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import {
  emailUnavailableMessage,
  enterAfterClerkSession,
  hrefAfterClerkAuth,
  prepareApplyDraft,
} from "@/lib/afterClerkAuth";
import {
  clerkDisplayName,
  clerkErrorMessage,
  isAlreadySignedInError,
  isPhoneUnavailableError,
  type ClerkGetToken,
} from "@/lib/clerk";
import { clerkSignOutRecoveryMessage, releaseClerkSession } from "@/lib/clerkSignIn";
import { continuationAfterSignUp } from "@/lib/clerkSignUp";
import {
  FACEBOOK_CONTACT_PROBLEM,
  FACEBOOK_CONTACT_TAKEN,
  FACEBOOK_NO_EMAIL,
  FACEBOOK_NO_TEXTS,
  FACEBOOK_RESTART,
  facebookContactFrom,
  isContactTakenError,
  type FacebookContact,
} from "@/lib/facebookSignIn";
import { useSession } from "@/store/session";

type Step =
  | { kind: "contact" }
  /** Finishing the new Facebook login with a code. */
  | { kind: "code"; contact: FacebookContact }
  /** The email or mobile is an existing GRIDGO person: sign in to them. */
  | { kind: "existing"; contact: FacebookContact };

/**
 * The end of a Facebook sign-in that Clerk cannot finish on its own: Facebook
 * shared no email (a mobile-only Facebook account), or shared one Clerk wants
 * proved. The person adds an email or mobile and the six-digit code sent to
 * it. An email or mobile that already belongs to a GRIDGO person signs in to
 * that person instead, so nobody ends up with a second account.
 */
export default function FacebookDetailsScreen() {
  const params = useLocalSearchParams<{ step?: string }>();
  const { signUp } = useSignUp();
  const { signIn } = useSignIn();
  const { getToken } = useAuth();
  const clerk = useClerk();
  const [typed, setTyped] = useState("");
  const [tried, setTried] = useState(false);
  const [step, setStep] = useState<Step>({ kind: "contact" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sentShared = useRef(false);

  const contact = facebookContactFrom(typed);

  async function sendSharedCode(email: string) {
    if (!signUp) return;
    setBusy(true);
    try {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setStep({ kind: "code", contact: { kind: "email", value: email } });
    } catch (error) {
      setProblem(clerkErrorMessage(error, "GRIDGO could not send your code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  // Facebook shared an email Clerk still wants proved: send its code at once.
  // Without one on the sign-up, the form below asks for it instead.
  const sharedEmail = params.step === "code" ? signUp?.emailAddress : null;
  useEffect(() => {
    if (!sharedEmail || sentShared.current) return;
    sentShared.current = true;
    void sendSharedCode(sharedEmail);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sends once, on arrival
  }, [sharedEmail]);

  async function enter() {
    useSession.getState().beginSessionWait("in");
    const next = await enterAfterClerkSession(getToken as ClerkGetToken);
    if (next.kind === "access" || (next.kind === "blocked" && next.message === emailUnavailableMessage)) {
      useSession.getState().refuseSignIn();
      setProblem(emailUnavailableMessage);
      if (!(await releaseClerkSession(() => clerk.signOut()))) setProblem(clerkSignOutRecoveryMessage);
      return;
    }
    if (next.kind === "blocked") {
      useSession.getState().clearSessionWait();
      setProblem(next.message);
      return;
    }
    if (next.kind === "join" || next.kind === "team_removed") useSession.getState().clearSessionWait();
    if (next.kind === "team_removed") return;
    if (next.kind === "join") {
      router.dismissTo("/join-team");
      return;
    }
    if (next.kind === "apply") {
      const person = clerk.user;
      prepareApplyDraft(person?.primaryEmailAddress?.emailAddress, clerkDisplayName(person));
    }
    router.replace(hrefAfterClerkAuth(next));
  }

  async function sendSignInCode(to: FacebookContact) {
    const sent =
      to.kind === "email"
        ? await signIn.emailCode.sendCode({ emailAddress: to.value })
        : await signIn.phoneCode.sendCode({ phoneNumber: to.value });
    if (sent.error) throw sent.error;
  }

  async function sendCode() {
    setTried(true);
    if (!contact || busy) return;
    if (!signUp?.id) {
      setProblem(FACEBOOK_RESTART);
      return;
    }
    setBusy(true);
    setProblem(null);
    setCode("");
    try {
      const updated = await signUp.update(
        contact.kind === "email" ? { emailAddress: contact.value } : { phoneNumber: contact.value },
      );
      if (updated.error) throw updated.error;
      const sent =
        contact.kind === "email"
          ? await signUp.verifications.sendEmailCode()
          : await signUp.verifications.sendPhoneCode();
      if (sent.error) throw sent.error;
      setStep({ kind: "code", contact });
    } catch (error) {
      if (isContactTakenError(error)) {
        try {
          await sendSignInCode(contact);
          setStep({ kind: "existing", contact });
        } catch (signInError) {
          setProblem(clerkErrorMessage(signInError, "GRIDGO could not send your code. Try again."));
        }
        return;
      }
      if (contact.kind === "phone" && isPhoneUnavailableError(error)) {
        setProblem(FACEBOOK_NO_TEXTS);
        return;
      }
      setProblem(clerkErrorMessage(error, "GRIDGO could not send your code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  async function finishSignUp() {
    if (!signUp) return;
    const next = continuationAfterSignUp({
      status: signUp.status,
      unverifiedFields: signUp.unverifiedFields,
      missingFields: signUp.missingFields,
      existingSession: signUp.existingSession,
    });
    if (next.kind === "existing_session") {
      await clerk.setActive({ session: next.sessionId });
      await enter();
      return;
    }
    if (next.kind === "complete") {
      const finalized = await signUp.finalize();
      if (finalized.error && !isAlreadySignedInError(finalized.error)) throw finalized.error;
      await enter();
      return;
    }
    setProblem(
      next.kind === "blocked"
        ? next.message
        : "Your code is checked, but Clerk still wants another detail. Go back and sign in with your email.",
    );
  }

  async function verify() {
    if (step.kind === "contact") return;
    const digits = code.replace(/\D/g, "");
    if (digits.length < 6 || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (step.kind === "existing") {
        const checked =
          step.contact.kind === "email"
            ? await signIn.emailCode.verifyCode({ code: digits })
            : await signIn.phoneCode.verifyCode({ code: digits });
        if (checked.error) throw checked.error;
        if (signIn.status !== "complete") {
          setProblem("Your code is checked, but this login needs another step. Go back and sign in with your email.");
          return;
        }
        const done = await signIn.finalize();
        if (done.error) throw done.error;
        await enter();
        return;
      }
      if (!signUp) return;
      const checked =
        step.contact.kind === "email"
          ? await signUp.verifications.verifyEmailCode({ code: digits })
          : await signUp.verifications.verifyPhoneCode({ code: digits });
      if (checked.error) throw checked.error;
      await finishSignUp();
    } catch (error) {
      useSession.getState().clearSessionWait();
      setProblem(clerkErrorMessage(error, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (step.kind === "contact" || busy) return;
    setBusy(true);
    setProblem(null);
    try {
      if (step.kind === "existing") {
        await sendSignInCode(step.contact);
      } else if (signUp) {
        const sent =
          step.contact.kind === "email"
            ? await signUp.verifications.sendEmailCode()
            : await signUp.verifications.sendPhoneCode();
        if (sent.error) throw sent.error;
      }
    } catch (error) {
      setProblem(clerkErrorMessage(error, "GRIDGO could not send another code. Try again."));
    } finally {
      setBusy(false);
    }
  }

  if (step.kind !== "contact") {
    const byText = step.contact.kind === "phone";
    return (
      <FormScrollView contentClassName="gg-page gap-5 pb-10 pt-6">
        {step.kind === "existing" ? (
          <Text className="text-body text-text-secondary" accessibilityRole="alert">
            {FACEBOOK_CONTACT_TAKEN}
          </Text>
        ) : null}
        <JobTicketCode
          title={byText ? "Check your texts" : "Check your email"}
          email={byText ? typed.trim() : step.contact.value}
          value={code}
          onChange={setCode}
          onVerify={() => void verify()}
          onResend={() => void resend()}
          verifyLabel={step.kind === "existing" ? "Sign in" : byText ? "Verify my number" : undefined}
          busy={busy}
          error={problem}
        />
        <Pressable
          onPress={() => {
            setStep({ kind: "contact" });
            setProblem(null);
            setCode("");
          }}
          accessibilityRole="button"
          className="gg-touch items-center justify-center"
        >
          <Text className="text-button text-text-primary underline">Use a different email or mobile</Text>
        </Pressable>
      </FormScrollView>
    );
  }

  return (
    <FormScrollView contentClassName="gg-page gap-5 pb-10 pt-6">
      <View className="gap-2">
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          One more step
        </Text>
        <Text className="text-body-lg text-text-secondary">{FACEBOOK_NO_EMAIL}</Text>
      </View>
      <FieldShell
        label="Email or mobile"
        hint="We only use it to sign you in and to reach you about your shop."
        error={tried && !contact ? FACEBOOK_CONTACT_PROBLEM : null}
      >
        <TextField
          value={typed}
          onChange={setTyped}
          kind="email"
          placeholder="you@example.com or 0917 123 4567"
          accessibilityLabel="Email or mobile"
          returnKeyType="send"
          onSubmit={() => void sendCode()}
        />
      </FieldShell>
      {problem ? <ErrorNotice message={problem} /> : null}
      {problem === FACEBOOK_RESTART ? null : (
        <PrimaryButton
          label={busy ? "Sending…" : "Send my code"}
          disabled={busy}
          onPress={() => void sendCode()}
        />
      )}
      <Pressable
        onPress={() => router.back()}
        accessibilityRole="button"
        className="gg-touch items-center justify-center"
      >
        <Text className="text-button text-text-primary underline">Sign in another way</Text>
      </Pressable>
    </FormScrollView>
  );
}
