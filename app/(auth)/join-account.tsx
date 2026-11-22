import { useClerk, useSignUp } from "@clerk/expo";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { ErrorNotice } from "@/components/ErrorNotice";
import { FormScrollView } from "@/components/FormScrollView";
import { JobTicketCode } from "@/components/JobTicketCode";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { PasswordField } from "@/components/controls/PasswordField";
import { TextField } from "@/components/controls/TextField";
import { PhoneUnavailable } from "@/components/team/PhoneUnavailable";
import {
  clerkErrorMessage,
  isAlreadySignedInError,
  isPhoneUnavailableError,
  splitPersonName,
} from "@/lib/clerk";
import { continuationAfterSignUp } from "@/lib/clerkSignUp";
import { isEmailish } from "@/lib/onboardingSteps";
import { normalizeInviteIdentity } from "@/lib/shopTeam";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RULE,
  PASSWORD_TOO_SHORT,
} from "@/lib/signup";
import { useTeamJoin } from "@/store/teamJoin";

/**
 * A login for someone joining a shop's team.
 *
 * Only the person. With a link or QR in hand (report F315793B): name, mobile
 * and the texted six-digit code — GRIDGO asks a new person joining that way
 * for a verified mobile. With an email invite: name, email, password and the
 * emailed code. No shop is opened — the join screen claims the invite next,
 * naming the person with what they typed here, and the Owner approves.
 */
export default function JoinAccountScreen() {
  const { signUp } = useSignUp();
  const { setActive } = useClerk();
  const hasLink = useTeamJoin((s) => s.token != null);
  const [withMobile, setWithMobile] = useState(hasLink);
  const [mobile, setMobile] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [tried, setTried] = useState(false);
  // Clerk refused a mobile login outright: this GRIDGO does not text codes yet.
  const [phoneUnavailable, setPhoneUnavailable] = useState(false);

  const nameProblem = name.trim() ? null : "Add your name.";
  const emailProblem =
    withMobile || isEmailish(email.trim())
      ? null
      : "Add the email the owner invited.";
  const passwordProblem =
    withMobile || password.length >= MIN_PASSWORD_LENGTH
      ? null
      : PASSWORD_TOO_SHORT;
  const phone = normalizeInviteIdentity("phone", mobile);
  const mobileProblem =
    !withMobile || phone
      ? null
      : "Check the number. It looks like 0917 123 4567.";
  const ready =
    !nameProblem && !emailProblem && !passwordProblem && !mobileProblem;

  function done() {
    useTeamJoin.getState().holdName(name);
    useTeamJoin.getState().startJoining();
    router.dismissTo("/join-team");
  }

  async function finish(): Promise<void> {
    if (!signUp) return;
    const next = continuationAfterSignUp({
      status: signUp.status,
      unverifiedFields: signUp.unverifiedFields,
      missingFields: signUp.missingFields,
      existingSession: signUp.existingSession,
    });
    if (next.kind === "existing_session") {
      await setActive({ session: next.sessionId }).catch(() => undefined);
      done();
      return;
    }
    if (next.kind === "complete") {
      const finalized = await signUp.finalize();
      if (finalized.error && !isAlreadySignedInError(finalized.error))
        throw finalized.error;
      done();
      return;
    }
    if (next.kind === "phone_code") {
      if (verifying)
        throw new Error(
          "Your number is checked, but the login still needs attention.",
        );
      const sent = await signUp.verifications.sendPhoneCode();
      if (sent.error) throw sent.error;
      setVerifying(true);
      return;
    }
    if (next.kind === "email_code") {
      if (verifying)
        throw new Error(
          "Your email is checked, but the login still needs attention.",
        );
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setVerifying(true);
      return;
    }
    setProblem(next.message);
  }

  async function create() {
    setTried(true);
    if (!signUp || !ready) return;
    setBusy(true);
    setProblem(null);
    try {
      const result =
        withMobile && phone
          ? await signUp.create({
              phoneNumber: phone,
              ...splitPersonName(name.trim()),
            })
          : await signUp.password({
              emailAddress: email.trim().toLowerCase(),
              password,
              ...splitPersonName(name.trim()),
            });
      if (result.error) {
        if (isAlreadySignedInError(result.error)) {
          done();
          return;
        }
        throw result.error;
      }
      await finish();
    } catch (error) {
      if (withMobile && isPhoneUnavailableError(error)) {
        setPhoneUnavailable(true);
        return;
      }
      setProblem(
        clerkErrorMessage(
          error,
          "GRIDGO could not make your login. Check your details and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    const typed = code.replace(/\D/g, "");
    if (!signUp || typed.length < 6) return;
    setBusy(true);
    setProblem(null);
    try {
      const checked = withMobile
        ? await signUp.verifications.verifyPhoneCode({ code: typed })
        : await signUp.verifications.verifyEmailCode({ code: typed });
      if (checked.error) throw checked.error;
      await finish();
    } catch (error) {
      setProblem(clerkErrorMessage(error, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!signUp) return;
    setBusy(true);
    setProblem(null);
    try {
      const sent = withMobile
        ? await signUp.verifications.sendPhoneCode()
        : await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
    } catch (error) {
      setProblem(
        clerkErrorMessage(
          error,
          "GRIDGO could not send another code. Try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  /**
   * The way in that works while mobile logins are closed: an email invite
   * from the owner. A new person cannot claim a link or QR with an email
   * login (GRIDGO asks for a verified mobile), so the link is let go here and
   * the join screen finds the email invite instead. Still joining.
   */
  function joinWithEmail() {
    useTeamJoin.getState().dropToken();
    setPhoneUnavailable(false);
    setWithMobile(false);
    setProblem(null);
    setTried(false);
  }

  if (verifying) {
    return (
      <FormScrollView contentClassName="gg-page gap-4 pb-10 pt-6">
        <JobTicketCode
          title={withMobile ? "Check your texts" : "Check your email"}
          verifyLabel={withMobile ? "Verify my number" : undefined}
          email={withMobile ? mobile.trim() : email.trim()}
          value={code}
          onChange={setCode}
          onVerify={() => void verify()}
          onResend={() => void resend()}
          busy={busy}
          error={problem}
        />
      </FormScrollView>
    );
  }

  return (
    <FormScrollView contentClassName="gg-page gap-5 pb-10 pt-6">
      <View className="gap-2">
        <Text className="text-h1 text-text-primary" accessibilityRole="header">
          Your login
        </Text>
        <Text className="text-body-lg text-text-secondary">
          {withMobile
            ? "Your name and mobile. We text you a 6-digit code."
            : "Use the email the owner invited."}
        </Text>
      </View>
      <FieldShell label="Your name" error={tried ? nameProblem : null}>
        <TextField
          value={name}
          onChange={setName}
          kind="name"
          placeholder="Sam Santos"
          accessibilityLabel="Your name"
        />
      </FieldShell>
      {withMobile ? (
        <FieldShell label="Your mobile" error={tried ? mobileProblem : null}>
          <TextField
            value={mobile}
            onChange={setMobile}
            kind="phone"
            placeholder="0917 123 4567"
            accessibilityLabel="Your mobile"
            returnKeyType="done"
            onSubmit={() => void create()}
          />
        </FieldShell>
      ) : null}
      {withMobile ? null : (
        <>
          <FieldShell label="Email" error={tried ? emailProblem : null}>
            <TextField
              value={email}
              onChange={setEmail}
              kind="email"
              placeholder="you@example.com"
              accessibilityLabel="Email"
            />
          </FieldShell>
          <FieldShell
            label="Password"
            hint={PASSWORD_RULE}
            error={tried ? passwordProblem : null}
          >
            <PasswordField
              value={password}
              onChange={setPassword}
              kind="new-password"
              placeholder="Choose a password"
              accessibilityLabel="Password"
              returnKeyType="done"
              onSubmit={() => void create()}
            />
          </FieldShell>
        </>
      )}
      {problem ? <ErrorNotice message={problem} /> : null}
      {withMobile && phoneUnavailable ? (
        <PhoneUnavailable moment="join" onEmail={joinWithEmail} />
      ) : (
        <PrimaryButton
          label={
            busy
              ? "Making your login…"
              : withMobile
                ? "Send my code"
                : "Make my login"
          }
          disabled={busy}
          onPress={() => void create()}
        />
      )}
      <Pressable
        onPress={() => {
          setWithMobile(!withMobile);
          setProblem(null);
          setTried(false);
        }}
        accessibilityRole="button"
        className="gg-touch items-center justify-center"
      >
        <Text className="text-button text-text-primary underline">
          {withMobile
            ? "The owner invited my email instead"
            : "Join with my mobile instead"}
        </Text>
      </Pressable>
      {withMobile && !phoneUnavailable ? (
        <Pressable
          onPress={() => router.push("/(auth)/phone-sign-in")}
          accessibilityRole="link"
          className="gg-touch items-center justify-center"
        >
          <Text className="text-button text-text-primary underline">I already have a login with this mobile</Text>
        </Pressable>
      ) : null}
    </FormScrollView>
  );
}
