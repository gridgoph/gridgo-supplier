/**
 * Where onboarding should land when the user skips or finishes.
 *
 * Entry points are explicit — do not rely on navigation history alone when
 * replaying from Settings.
 */
export type OnboardingExit = "settings" | "back" | "launcher";

export function resolveOnboardingExit(
  from: string | undefined,
  canGoBack: boolean,
): OnboardingExit {
  if (from === "settings") return "settings";
  if (canGoBack) return "back";
  return "launcher";
}
