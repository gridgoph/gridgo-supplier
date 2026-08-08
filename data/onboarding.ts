/**
 * Supplier onboarding copy.
 *
 * Three beats, in the order work actually lands: jobs find the shop, the shop
 * produces and self-checks, then the job is handed off and paid.
 *
 * The copy names things a Davao print supplier already does — accept/decline
 * under SLA, self-QC evidence, rider pickup, protected payment — rather than
 * describing features.
 */

import type { IllustrationName } from "@/components/illustrations";

export type OnboardingSlide = {
  id: string;
  /** Position stated in text, so it survives reduced motion and grayscale. */
  step: string;
  title: string;
  body: string;
  /** A clear verb. Changes on the last slide, which is the one that starts. */
  cta: string;
  /** Which piece of art carries this beat. */
  art: IllustrationName;
};

export const onboardingSlides: readonly OnboardingSlide[] = [
  {
    id: "jobs",
    step: "01 / 03",
    title: "Jobs find your shop",
    body: "GRIDGO matches print work to your capacity. Accept or decline inside the SLA — no sales chase, no Messenger ping-pong.",
    cta: "Next",
    art: "storefront",
  },
  {
    id: "produce",
    step: "02 / 03",
    title: "Produce and check it",
    body: "Work the approved spec and artwork. Upload self-QC evidence before you mark the job ready for pickup.",
    cta: "Next",
    art: "working",
  },
  {
    id: "handoff",
    step: "03 / 03",
    title: "Hand off and get paid",
    body: "Stage the job for the rider, then track protected payment status as settlement clears.",
    cta: "Get Started",
    art: "packages",
  },
] as const;
