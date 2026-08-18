import { useAuth, useClerk, useSignUp } from "@clerk/expo";
import { router } from "expo-router";
import { ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";

import { BusyOverlay } from "@/components/BusyOverlay";
import { ErrorNotice } from "@/components/ErrorNotice";
import { OnboardingStep } from "@/components/OnboardingStep";
import { PrimaryButton } from "@/components/PrimaryButton";
import { FieldShell } from "@/components/controls/FieldShell";
import { TextField } from "@/components/controls/TextField";
import { PUBLISHED_CATALOG } from "@/data/serviceCatalog";
import { useThemeColors } from "@/hooks/useTheme";
import * as api from "@/lib/api";
import {
  awaitClerkSessionToken,
  clerkErrorMessage,
  isAlreadySignedInError,
  splitPersonName,
} from "@/lib/clerk";
import { continuationAfterSignUp } from "@/lib/clerkSignUp";
import { firstIncompleteStep, stepAt, type OnboardingStep as Step } from "@/lib/onboardingSteps";
import { coordinateText, isPlaced } from "@/lib/shopLocation";
import { enrollmentIdempotencyKey, toEnrollRequest } from "@/lib/signup";
import { useSession } from "@/store/session";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Last step: one read through, then the account.
 *
 * Everything here is a way back to where it was typed — recognition rather than
 * recall. Nothing on this screen promises work: the last panel says what
 * actually happens, which is that Operations reviews the shop before a job
 * ever arrives.
 *
 * Send creates a Clerk session if this phone is not already signed in, then
 * enrolls the shop. Papers are collected after the account exists.
 */
export default function ReviewStep() {
  const draft = useSignupDraft((s) => s.draft);
  const patch = useSignupDraft((s) => s.patch);
  const clearDraft = useSignupDraft((s) => s.clear);
  const { enrollSupplier, loading, error, clearError } = useSession();
  const { signUp, fetchStatus } = useSignUp();
  const { isSignedIn, getToken } = useAuth();
  const { setActive } = useClerk();
  const step = stepAt("review");
  const incomplete = firstIncompleteStep(draft);
  const [verifying, setVerifying] = useState(false);
  const [code, setCode] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const sending = loading || busy || fetchStatus === "fetching";
  const shownError = localError ?? error;

  async function continueSignUp(options?: { allowEmailCode?: boolean }): Promise<"ready" | "email_code" | "blocked"> {
    if (!signUp) return "blocked";
    const next = continuationAfterSignUp({
      status: signUp.status,
      unverifiedFields: signUp.unverifiedFields,
      missingFields: signUp.missingFields,
      existingSession: signUp.existingSession,
    });

    if (next.kind === "existing_session") {
      try {
        await setActive({ session: next.sessionId });
      } catch {
        // Already the active session — the token wait below is the test.
      }
      return "ready";
    }
    if (next.kind === "complete") {
      const finalized = await signUp.finalize();
      if (finalized.error && !isAlreadySignedInError(finalized.error)) {
        throw finalized.error;
      }
      return "ready";
    }
    if (next.kind === "email_code") {
      if (options?.allowEmailCode === false) {
        throw new Error("Your email is verified, but the account still needs attention.");
      }
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setVerifying(true);
      return "email_code";
    }
    setLocalError(next.message);
    return "blocked";
  }

  async function ensureClerkSession(): Promise<"ready" | "email_code" | "blocked"> {
    if (isSignedIn) return "ready";
    if (!signUp) {
      setLocalError("GRIDGO could not start your sign-up. Try again in a moment.");
      return "blocked";
    }
    const result = await signUp.password({
      emailAddress: draft.email.trim().toLowerCase(),
      password: draft.password,
      ...splitPersonName(draft.contactName),
    });
    if (result.error) {
      if (isAlreadySignedInError(result.error)) return "ready";
      throw result.error;
    }
    return continueSignUp();
  }

  async function enroll(): Promise<boolean> {
    const request = toEnrollRequest(draft);
    if (!request) {
      router.push("/(auth)/signup/location");
      return false;
    }
    const key = enrollmentIdempotencyKey(draft.enrollKey);
    if (key !== draft.enrollKey) patch({ enrollKey: key });

    api.setTokenProvider(getToken);
    const token = await awaitClerkSessionToken(getToken);
    if (!token) {
      setLocalError("GRIDGO could not confirm your sign-in. Wait a moment and try again.");
      return false;
    }

    const created = await enrollSupplier(request, key);
    if (!created) return false;
    clearDraft();
    return true;
  }

  async function open() {
    clearError();
    setLocalError(null);
    if (incomplete) {
      router.push(incomplete.route);
      return;
    }
    if (!toEnrollRequest(draft)) {
      router.push("/(auth)/signup/location");
      return;
    }

    setBusy(true);
    try {
      const clerk = await ensureClerkSession();
      if (clerk !== "ready") return;
      await enroll();
    } catch (caught) {
      if (isAlreadySignedInError(caught)) {
        try {
          await enroll();
          return;
        } catch (retry) {
          setLocalError(
            clerkErrorMessage(retry, "GRIDGO could not open your shop account. Try again."),
          );
          return;
        }
      }
      setLocalError(
        clerkErrorMessage(caught, "GRIDGO could not open your shop account. Check your details and try again."),
      );
    } finally {
      setBusy(false);
    }
  }

  async function verifyEmail() {
    const typed = code.trim();
    if (!signUp || typed.length < 6) return;
    clearError();
    setLocalError(null);
    setBusy(true);
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: typed });
      if (result.error) throw result.error;
      const next = await continueSignUp({ allowEmailCode: false });
      if (next !== "ready") return;
      await enroll();
    } catch (caught) {
      setLocalError(clerkErrorMessage(caught, "That code could not be verified."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <OnboardingStep
      id="review"
      title={verifying ? "Verify your email" : step.title}
      lede={
        verifying
          ? `Enter the six-digit code sent to ${draft.email.trim()}.`
          : step.lede
      }
      contentClassName="gap-3 pb-4 pt-4"
      overlay={
        <BusyOverlay
          visible={sending && !verifying}
          label="Opening your shop account. Do not close the app."
        />
      }
      footer={
        <>
          {shownError ? <ErrorNotice message={shownError} /> : null}
          <PrimaryButton
            label={
              sending
                ? verifying
                  ? "Checking…"
                  : "Sending your application…"
                : verifying
                  ? "Verify email"
                  : "Send my application"
            }
            disabled={sending || (verifying && code.trim().length < 6)}
            onPress={() => void (verifying ? verifyEmail() : open())}
          />
        </>
      }
    >
      {verifying ? (
        <FieldShell label="Verification code">
          <TextField
            value={code}
            onChange={setCode}
            kind="code"
            placeholder="123456"
            accessibilityLabel="Verification code"
            returnKeyType="go"
            onSubmit={() => void verifyEmail()}
          />
        </FieldShell>
      ) : (
        <>
          <ReviewCard
            step={stepAt("shop")}
            lines={[draft.shopName, draft.contactName, draft.email, draft.phone].filter(Boolean)}
            missing={incomplete?.id === "shop"}
          />

          <ReviewCard
            step={stepAt("location")}
            lines={
              isPlaced(draft.pin)
                ? [draft.pin.label || "No address on the pin yet", coordinateText(draft.pin)]
                : []
            }
            missing={!isPlaced(draft.pin)}
          />

          <ReviewCard
            step={stepAt("services")}
            lines={draft.categoryCodes.map((code, index) => `${index + 1}. ${categoryName(code)}`)}
            missing={draft.categoryCodes.length === 0}
          />

          <View className="gg-panel gap-2">
            <Text className="text-body font-medium text-text-primary">
              What happens after you press this
            </Text>
            <Text className="text-body text-text-secondary">
              GRIDGO opens your account and signs you in. No job is matched to your shop until
              Operations has read all of this and approved it — so your floor stays empty until then,
              and the app will say so rather than looking like a quiet day.
            </Text>
            <Text className="text-body text-text-secondary">
              They usually come back within a working day. You will not need to apply again.
            </Text>
          </View>
        </>
      )}
      <View nativeID="clerk-captcha" />
    </OnboardingStep>
  );
}

/** One step, summarised, and a way back to the screen it was typed on. */
function ReviewCard({
  step,
  lines,
  missing,
  emptyLine,
}: {
  step: Step;
  lines: string[];
  missing?: boolean;
  emptyLine?: string;
}) {
  const colors = useThemeColors();

  return (
    <Pressable
      onPress={() => router.push(step.route)}
      accessibilityRole="button"
      accessibilityLabel={`Change ${step.title.toLowerCase()}`}
      className="gg-card flex-row items-start gap-3"
      style={({ pressed }) => (pressed ? { opacity: 0.7 } : undefined)}
    >
      <View className="min-w-0 flex-1 gap-1">
        <Text className="text-caption text-text-muted">{step.title}</Text>
        {lines.length ? (
          lines.map((line) => (
            <Text key={line} className="text-body text-text-primary">
              {line}
            </Text>
          ))
        ) : (
          <Text className={missing ? "text-body text-error" : "text-body text-text-muted"}>
            {missing ? "Still needed — tap to fill this in" : (emptyLine ?? "Nothing added")}
          </Text>
        )}
      </View>
      <View className="pt-0.5">
        <ChevronRight size={20} color={colors.textMuted} accessibilityElementsHidden />
      </View>
    </Pressable>
  );
}

function categoryName(code: string): string {
  return PUBLISHED_CATALOG.find((category) => category.code === code)?.name ?? code;
}
