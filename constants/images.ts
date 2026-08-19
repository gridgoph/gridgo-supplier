import type { OnboardingArt } from "@/data/onboarding";

/**
 * Raster images, required in one place.
 *
 * Screens and components take `images.*` from here — they do not `require`
 * an asset themselves. Metro wants a static `require` of a string literal,
 * so each file is named here, not discovered.
 */
export const images = {
  onboarding: {
    invoices: require("../assets/images/onboarding/invoices.png"),
    checklist: require("../assets/images/onboarding/checklist.png"),
    payment: require("../assets/images/onboarding/payment.png"),
  } satisfies Record<OnboardingArt, number>,
};
