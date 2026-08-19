import type { SignupDraft } from "@/store/signupDraft";
import { isPlaced, pinProblem } from "@/lib/shopLocation";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";

/**
 * Opening a shop account, as a sequence rather than one long form.
 *
 * The order is the one a print-shop owner would use standing at their own
 * counter: who you are, where you print from, what you print, then one
 * read-through. Papers live on the accreditation screen after the account
 * exists — they are not part of apply.
 *
 * The numbering is honest: this genuinely is a sequence, and a shop needs to
 * know how much is left. Nothing here promises work — the last step says
 * plainly that Operations reviews the account before any job arrives.
 */

export type OnboardingStepId = "shop" | "location" | "services" | "review";

export type OnboardingStep = {
  id: OnboardingStepId;
  /** Route under `app/(auth)/signup/`. */
  route:
    | "/(auth)/signup"
    | "/(auth)/signup/location"
    | "/(auth)/signup/services"
    | "/(auth)/signup/review";
  /** What the step is called in the header and the progress line. */
  title: string;
  /** One sentence on why GRIDGO is asking. */
  lede: string;
};

export const ONBOARDING_STEPS: readonly OnboardingStep[] = [
  {
    id: "shop",
    route: "/(auth)/signup",
    title: "Your shop",
    lede: "The name clients and riders see, and how GRIDGO reaches you when a job needs a decision.",
  },
  {
    id: "location",
    route: "/(auth)/signup/location",
    title: "Where you print",
    lede: "Put your shop on the map. Every delivery fee is measured from this pin.",
  },
  {
    id: "services",
    route: "/(auth)/signup/services",
    title: "What you print",
    lede: "Best first. GRIDGO offers you work in the order you rank here.",
  },
  {
    id: "review",
    route: "/(auth)/signup/review",
    title: "Check and send",
    lede: "One read through, then GRIDGO opens your account and Operations takes it from there.",
  },
] as const;

export function stepIndex(id: OnboardingStepId): number {
  return ONBOARDING_STEPS.findIndex((step) => step.id === id);
}

export function stepAt(id: OnboardingStepId): OnboardingStep {
  return ONBOARDING_STEPS[stepIndex(id)] ?? ONBOARDING_STEPS[0];
}

export function nextStep(id: OnboardingStepId): OnboardingStep | null {
  return ONBOARDING_STEPS[stepIndex(id) + 1] ?? null;
}

/** "Step 2 of 4" — the sequence is real, so it is numbered. */
export function stepProgressLabel(id: OnboardingStepId): string {
  return `Step ${stepIndex(id) + 1} of ${ONBOARDING_STEPS.length}`;
}

/* --------------------------------------------------------------------------
   What each step still needs

   One function per step so a screen can show the problem on the field it
   belongs to, and the review step can say which step to go back to.
   -------------------------------------------------------------------------- */

export type StepProblems = Partial<Record<string, string>>;

/** Apply after a live Clerk session does not choose a password. */
export type ApplyOptions = { clerkSession?: boolean };

export function shopStepProblems(draft: SignupDraft, options?: ApplyOptions): StepProblems {
  const problems: StepProblems = {};
  if (!draft.shopName.trim()) {
    problems.shopName = "Enter the name clients and riders will see on your jobs.";
  }
  if (!draft.contactName.trim()) {
    problems.contactName = "Enter the name of the person GRIDGO should talk to.";
  }
  if (!isEmailish(draft.email)) {
    problems.email = "Enter a working email address — GRIDGO sends your job alerts to it.";
  }
  if (!isPhoneish(draft.phone)) {
    problems.phone = "Enter a mobile number GRIDGO and the rider can reach you on.";
  }
  if (!options?.clerkSession && draft.password.length < MIN_PASSWORD_LENGTH) {
    problems.password = `Choose a password of at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  return problems;
}

export function locationStepProblems(draft: SignupDraft): StepProblems {
  const problem = pinProblem(draft.pin, draft.pin?.label ?? "");
  return problem ? { pin: problem } : {};
}

export function servicesStepProblems(draft: SignupDraft): StepProblems {
  return draft.categoryCodes.length
    ? {}
    : { categoryCodes: "Pick at least one kind of work, starting with what you do best." };
}

export function stepProblems(
  id: OnboardingStepId,
  draft: SignupDraft,
  options?: ApplyOptions,
): StepProblems {
  switch (id) {
    case "shop":
      return shopStepProblems(draft, options);
    case "location":
      return locationStepProblems(draft);
    case "services":
      return servicesStepProblems(draft);
    default:
      return {};
  }
}

export function hasProblems(problems: StepProblems): boolean {
  return Object.keys(problems).length > 0;
}

/** The first step still missing something, or null when the draft is complete. */
export function firstIncompleteStep(
  draft: SignupDraft,
  options?: ApplyOptions,
): OnboardingStep | null {
  for (const step of ONBOARDING_STEPS) {
    if (hasProblems(stepProblems(step.id, draft, options))) return step;
  }
  return null;
}

/** Whether the draft carries enough for enroll to be worth sending. */
export function isSendable(draft: SignupDraft, options?: ApplyOptions): boolean {
  return firstIncompleteStep(draft, options) === null && isPlaced(draft.pin);
}

/**
 * Where Sign in should open apply. A leftover draft skips steps already filled.
 * A sendable draft goes to review so the shop can send.
 */
export function applyRoute(draft: SignupDraft, options?: ApplyOptions): OnboardingStep["route"] {
  return firstIncompleteStep(draft, options)?.route ?? "/(auth)/signup/review";
}

/** Deliberately loose: the platform is the authority, this catches typos. */
function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhoneish(value: string): boolean {
  return value.replace(/[^0-9]/g, "").length >= 10;
}
