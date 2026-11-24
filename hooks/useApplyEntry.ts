import { useAuth, useClerk, useSignUp } from "@clerk/expo";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";

import * as api from "@/lib/api";
import { awaitClerkSessionToken, clerkErrorMessage, isAlreadySignedInError } from "@/lib/clerk";
import { clerkOffersPhoneNumbers } from "@/lib/clerkPhone";
import { continuationAfterSignUp } from "@/lib/clerkSignUp";
import { eligibilityValue } from "@/lib/guidedSignup";
import { HOME_NOT_OPEN_YET, homeKindHonoured } from "@/lib/homePrinter";
import { applyRoute } from "@/lib/onboardingSteps";
import { useGuidedSignup } from "@/store/guidedSignup";
import { useSignupDraft } from "@/store/signupDraft";

/**
 * Where apply goes once there is a sign-in.
 *
 * Guided sign-up keeps its draft on GRIDGO, so it needs a Clerk session before
 * anything is saved. `enter()` reads the draft: a GRIDGO that offers the
 * guided flow opens the missions (saving step 0 first when the phone holds
 * it); one that does not carries on with the older four steps, already signed
 * in, exactly as before.
 */
export function useApplyEntry() {
  const { getToken } = useAuth();
  const clerk = useClerk();
  const [entering, setEntering] = useState(false);
  const [entryError, setEntryError] = useState<string | null>(null);

  const enter = useCallback(async (): Promise<boolean> => {
    setEntering(true);
    setEntryError(null);
    try {
      api.setTokenProvider(getToken);
      const token = await awaitClerkSessionToken(getToken);
      if (!token) {
        setEntryError("GRIDGO could not confirm your sign-in. Wait a moment and try again.");
        return false;
      }
      const store = useGuidedSignup.getState();
      const mode = await store.load();
      if (mode === "legacy") {
        router.replace(applyRoute(useSignupDraft.getState().draft, { clerkSession: true }));
        return true;
      }
      if (mode !== "guided") {
        setEntryError(useGuidedSignup.getState().error ?? "GRIDGO could not open your sign-up. Try again.");
        return false;
      }
      const signup = useGuidedSignup.getState().signup;
      // Not started on GRIDGO yet, and this Clerk cannot confirm a mobile:
      // the guided flow would stop at its first step, so use the older one.
      // A home printer stays here either way: the older steps would open a print shop.
      const local0 = useSignupDraft.getState().draft.eligibility;
      const home = local0?.shopKind === "home_printer" || signup?.steps.eligibility?.shopKind === "home_printer";
      if (!home && !signup?.steps.shop && (await clerkOffersPhoneNumbers(clerk.publishableKey)) === false) {
        useGuidedSignup.setState({ mode: "legacy" });
        router.replace(applyRoute(useSignupDraft.getState().draft, { clerkSession: true }));
        return true;
      }
      const local = useSignupDraft.getState().draft.eligibility;
      const savedKind = signup?.steps.eligibility?.shopKind;
      // A home choice GRIDGO did not take is asked again, and the new answer replaces it.
      const retake = Boolean(savedKind === "home_printer" && useGuidedSignup.getState().homeUnavailable && !signup?.steps.shop);
      if (!signup?.steps.eligibility || retake) {
        const value = local ? eligibilityValue(local) : null;
        if (!value && retake) {
          router.replace("/(auth)/signup/start");
          return false;
        }
        if (!value) {
          router.replace("/(auth)/signup/start");
          return true;
        }
        const before = useGuidedSignup.getState().terms?.locationConsentWording ?? "";
        const saved = await store.save("eligibility", value);
        if (saved.status === "failed") {
          setEntryError(saved.message);
          return false;
        }
        // A GRIDGO without home printers would open a print shop: say so, and ask again.
        if (
          value.shopKind === "home_printer" &&
          saved.status === "ok" &&
          !homeKindHonoured(before, saved.terms.locationConsentWording)
        ) {
          useGuidedSignup.setState({ homeUnavailable: true });
          const draft = useSignupDraft.getState();
          draft.patch({ eligibility: { ...(local ?? { registrantRole: null, adult: false }), shopKind: null } });
          setEntryError(HOME_NOT_OPEN_YET);
          router.replace("/(auth)/signup/start");
          return false;
        }
      }
      router.replace("/(auth)/signup/missions");
      return true;
    } finally {
      setEntering(false);
    }
  }, [clerk.publishableKey, getToken]);

  return { enter, entering, entryError };
}

/**
 * Creating the sign-in itself: email and password, then the emailed code when
 * Clerk asks for one. Lifted from the review step so guided sign-up makes the
 * account first and the older flow keeps working from its last step.
 */
export function useClerkSignUpFlow() {
  const { signUp } = useSignUp();
  const { isSignedIn } = useAuth();
  const { setActive } = useClerk();
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continueSignUp(allowEmailCode = true): Promise<"ready" | "email_code" | "blocked"> {
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
        // Already the active session.
      }
      return "ready";
    }
    if (next.kind === "complete") {
      const finalized = await signUp.finalize();
      if (finalized.error && !isAlreadySignedInError(finalized.error)) throw finalized.error;
      return "ready";
    }
    if (next.kind === "email_code") {
      if (!allowEmailCode) throw new Error("Your email is verified, but the account still needs attention.");
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
      setAwaitingCode(true);
      return "email_code";
    }
    setError(next.kind === "blocked" ? next.message : "Your account could not be created yet. Check your details and try again.");
    return "blocked";
  }

  async function create(input: { email: string; password: string }): Promise<"ready" | "email_code" | "blocked"> {
    setError(null);
    if (isSignedIn) return "ready";
    if (!signUp) {
      setError("GRIDGO could not start your sign-up. Try again in a moment.");
      return "blocked";
    }
    try {
      const result = await signUp.password({
        emailAddress: input.email.trim().toLowerCase(),
        password: input.password,
      });
      if (result.error) {
        if (isAlreadySignedInError(result.error)) return "ready";
        throw result.error;
      }
      return await continueSignUp();
    } catch (caught) {
      if (isAlreadySignedInError(caught)) return "ready";
      setError(clerkErrorMessage(caught, "GRIDGO could not create your sign-in. Check your details and try again."));
      return "blocked";
    }
  }

  async function verify(code: string): Promise<"ready" | "blocked"> {
    setError(null);
    if (!signUp) return "blocked";
    try {
      const result = await signUp.verifications.verifyEmailCode({ code: code.replace(/\D/g, "") });
      if (result.error) throw result.error;
      const next = await continueSignUp(false);
      return next === "ready" ? "ready" : "blocked";
    } catch (caught) {
      setError(clerkErrorMessage(caught, "That code could not be verified."));
      return "blocked";
    }
  }

  async function resend() {
    setError(null);
    if (!signUp) return;
    try {
      const sent = await signUp.verifications.sendEmailCode();
      if (sent.error) throw sent.error;
    } catch (caught) {
      setError(clerkErrorMessage(caught, "GRIDGO could not send another code. Try again."));
    }
  }

  return { create, verify, resend, awaitingCode, error, setError };
}

/**
 * Every guided step reads GRIDGO's draft itself when it opens without one —
 * a cold start or a resumed app lands on a step before the missions map has
 * read anything, and the step's wording (consents, page prices) comes from
 * that read.
 */
export function useGuidedStepDraft() {
  const { getToken } = useAuth();
  const terms = useGuidedSignup((s) => s.terms);
  useEffect(() => {
    if (terms) return;
    let live = true;
    void (async () => {
      api.setTokenProvider(getToken);
      await awaitClerkSessionToken(getToken);
      if (live) await useGuidedSignup.getState().load();
    })();
    return () => {
      live = false;
    };
  }, [getToken, terms]);
  return terms;
}

/** After a step saves: back to the map, even when the step was opened directly. */
export function returnToMissions() {
  if (router.canGoBack()) router.back();
  else router.replace("/(auth)/signup/missions");
}
