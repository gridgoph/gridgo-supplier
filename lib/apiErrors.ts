import * as api from "@/lib/api";

/**
 * Turn a demo-API failure into a sentence that names what happened and how to
 * fix it. No error code, state string, or snake_case identifier may reach the
 * screen — this module is the only place that reads them.
 */

const MESSAGES: Record<string, string> = {
  transition_not_allowed:
    "This job has already moved on. Pull down to refresh and take the step the job now shows.",
  order_not_found:
    "This job is no longer on your floor. GRIDGO may have rematched it to another shop.",
  service_not_found:
    "That service line is no longer on your account. Refresh, and ask Operations if it should still be there.",
  service_withdrawn:
    "This service line was withdrawn, so its capacity cannot be changed. Ask Operations to reinstate it.",
  forbidden:
    "Your account is not allowed to do this. Ask Operations to check your shop's accreditation.",
  invalid_service: "Some required details are missing. Fill every field and try again.",
  invalid_category_code:
    "GRIDGO has changed what it publishes since this screen loaded. Pull down to refresh and pick again.",
  invalid_material_code:
    "GRIDGO no longer offers one of the materials you picked. Refresh and choose from the current list.",
  invalid_finish_code:
    "GRIDGO no longer offers one of the finishes you picked. Refresh and choose from the current list.",
  already_live:
    "Operations has already verified this one, so there is nothing to send. Refresh to see it.",
  supplier_not_approved:
    "Your shop's accreditation is still with Operations, so services cannot be verified yet. They will let you know when it clears.",
  payout_held:
    "Protected payment is on hold for this job while Operations reviews a claim.",
};

export function humanizeApiError(error: unknown, fallback: string): string {
  if (error instanceof api.ApiError) {
    const body = error.body;
    const code =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : "";
    const known = MESSAGES[code];
    if (known) return known;
    if (error.status === 401) {
      return "Your session ended. Sign in again to continue.";
    }
    if (error.status >= 500) {
      return "GRIDGO could not complete this. Wait a moment and try again.";
    }
    return fallback;
  }
  return fallback;
}

/** Wording for a request that never reached the server at all. */
export function offlineMessage(subject: string): string {
  return `Cannot reach GRIDGO to ${subject}. Check this device's connection, then try again.`;
}
