/**
 * Client onboarding copy.
 *
 * Three beats, in the order a print job actually moves: the request, the
 * proof, the delivery. Riders and suppliers meet their own context after
 * sign-in, through role gating.
 *
 * The copy names things the Davao pilot's clients already recognise — the
 * Messenger back-and-forth it replaces, the preflight check, the stale
 * location warning — rather than describing features.
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
    id: "order",
    step: "01 / 03",
    title: "Order print the right way",
    body: "Pick the product, size, material and deadline in four steps. No back-and-forth on Messenger.",
    cta: "Next",
    art: "workstation",
  },
  {
    id: "approve",
    step: "02 / 03",
    title: "Approve before it prints",
    body: "Every file runs a preflight check. You see the proof and approve it, or send it back for changes.",
    cta: "Next",
    art: "proof",
  },
  {
    id: "track",
    step: "03 / 03",
    title: "Watch it come to you",
    body: "Track your rider on the map with a live ETA, and an honest note when the location goes stale.",
    cta: "Get Started",
    art: "scooter",
  },
] as const;
