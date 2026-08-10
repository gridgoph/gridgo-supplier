import type { SignupDraft } from "@/store/signupDraft";
import { isPlaced, pinProblem } from "@/lib/shopLocation";
import { MIN_PASSWORD_LENGTH } from "@/lib/signup";

/**
 * Opening a shop account, as a sequence rather than one long form.
 *
 * The order is the one a print-shop owner would use standing at their own
 * counter: who you are, where you print from, what you print, and the papers
 * that prove it. Each step is a route, so the platform's own back gesture works
 * and nothing typed is lost — the draft is persisted, not held in a screen.
 *
 * The numbering is honest: this genuinely is a sequence, and a shop needs to
 * know how much is left. Nothing here promises work — the last step says
 * plainly that Operations reviews the account before any job arrives.
 */

export type OnboardingStepId = "shop" | "location" | "services" | "documents" | "review";

export type OnboardingStep = {
  id: OnboardingStepId;
  /** Route under `app/(auth)/signup/`. */
  route:
    | "/(auth)/signup"
    | "/(auth)/signup/location"
    | "/(auth)/signup/services"
    | "/(auth)/signup/documents"
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
    id: "documents",
    route: "/(auth)/signup/documents",
    title: "Your papers",
    lede: "Operations checks these before they accredit a shop. Photos of the originals are fine.",
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

/** "Step 2 of 5" — the sequence is real, so it is numbered. */
export function stepProgressLabel(id: OnboardingStepId): string {
  return `Step ${stepIndex(id) + 1} of ${ONBOARDING_STEPS.length}`;
}

/* --------------------------------------------------------------------------
   What each step still needs

   One function per step so a screen can show the problem on the field it
   belongs to, and the review step can say which step to go back to.
   -------------------------------------------------------------------------- */

export type StepProblems = Partial<Record<string, string>>;

export function shopStepProblems(draft: SignupDraft): StepProblems {
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
  if (draft.password.length < MIN_PASSWORD_LENGTH) {
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

/**
 * Papers are not a gate.
 *
 * Operations asks for them and a shop without them waits longer, but blocking
 * account creation on a permit somebody has to photograph at the office would
 * turn a five-minute sign-up into a two-day one — and the account is not
 * matchable until Operations approves it either way.
 */
export function documentsStepProblems(): StepProblems {
  return {};
}

export function stepProblems(id: OnboardingStepId, draft: SignupDraft): StepProblems {
  switch (id) {
    case "shop":
      return shopStepProblems(draft);
    case "location":
      return locationStepProblems(draft);
    case "services":
      return servicesStepProblems(draft);
    case "documents":
      return documentsStepProblems();
    default:
      return {};
  }
}

export function hasProblems(problems: StepProblems): boolean {
  return Object.keys(problems).length > 0;
}

/** The first step still missing something, or null when the draft is complete. */
export function firstIncompleteStep(draft: SignupDraft): OnboardingStep | null {
  for (const step of ONBOARDING_STEPS) {
    if (hasProblems(stepProblems(step.id, draft))) return step;
  }
  return null;
}

/** Whether the draft carries enough for `POST /auth/signup` to be worth sending. */
export function isSendable(draft: SignupDraft): boolean {
  return firstIncompleteStep(draft) === null && isPlaced(draft.pin);
}

/** Deliberately loose: the platform is the authority, this catches typos. */
function isEmailish(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function isPhoneish(value: string): boolean {
  return value.replace(/[^0-9]/g, "").length >= 10;
}
