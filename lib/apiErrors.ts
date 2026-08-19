import * as api from "@/lib/api";

/**
 * Turn a demo-API failure into a sentence that names what happened and how to
 * fix it. No error code, state string, or snake_case identifier may reach the
 * screen — this module is the only place that reads them.
 */

/** A Clerk identity that GRIDGO will not project as a shop. */
export const supplierAccountNotFoundMessage =
  "No supplier account is connected to this sign-in. Apply as a shop, or ask Operations to check your invitation.";

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
    "The client has reported a problem with this job, so GRIDGO is holding what is left of your earnings until Operations settles it.",

  // Opening an account.
  email_already_registered:
    "That email already has a GRIDGO account. Sign in with it instead, or use a different address.",
  invalid_category_ranks:
    "Pick at least one kind of work and rank it. If a category has just been retired, close this and open it again to see the current list.",
  invitation_required:
    "This GRIDGO is not taking public shop applications. Ask Operations for an invitation link.",
  invalid_signup:
    "Some required details are missing or too short. Check every field, then try again.",
  invalid_password:
    "Choose a password of at least 8 characters, then try again.",
  invalid_email: "Enter a working email address — GRIDGO sends your job alerts to it.",
  invalid_phone: "Enter a mobile number GRIDGO and the rider can reach you on.",
  invalid_shop_location:
    "GRIDGO needs your shop's location to work out delivery. Fill in the address and try again.",
  not_found:
    "GRIDGO no longer offers this way of opening a shop account. Update the app or ask Operations.",
  unexpected_field:
    "GRIDGO rejected a field this app should not send. Update the app and try again.",
  invalid_application:
    "Some required shop details are missing or not valid. Check your shop, location, and services, then try again.",
  idempotency_key_required:
    "GRIDGO could not accept this application. Try sending it again.",
  application_already_exists:
    "This shop application is already open. Sign in with the same email to continue.",
  clerk_unavailable:
    "GRIDGO could not confirm your sign-in just now. Wait a moment and try again.",
  supplier_account_not_found: supplierAccountNotFoundMessage,

  // Money and evidence.
  invalid_money:
    "Enter your price for this job in pesos before you accept it.",
  invalid_milestone_code:
    "That part of the job does not take your evidence. Close this and pick one of the parts listed on the job.",
  milestone_not_found:
    "That part of the job is no longer there. Pull down to refresh and try again.",
  pof_required: "GRIDGO needs your evidence for this part before it can release it.",
  milestone_not_reached:
    "The job has not reached this part yet. Take the step it shows and file your evidence then.",
  payment_method_not_allowed:
    "GRIDGO has retired that way of paying. The client pays digitally in two parts, and nothing is collected at your counter.",
  assignment_notification_required:
    "The client has not been told your price yet. Pull down to refresh and try again.",

  // The shop's own board.
  catalog_item_not_found:
    "That listing is no longer on your board. Pull down to refresh and open it again.",
  catalog_item_stale:
    "This listing changed on another device while you were editing it. Pull down to refresh, then make your change again.",
  invalid_catalog_item:
    "Some details on this listing are missing or not valid. Check the name, price and pack size, then try again.",
  invalid_catalog_options:
    "Every step needs at least one option a client can choose. Add one, or remove the step.",
  invalid_subcategory_code:
    "GRIDGO has changed what it publishes since this screen loaded. Pull down to refresh and pick the kind of work again.",
  invalid_file_format:
    "GRIDGO no longer accepts one of those file types. Refresh and choose from the current list.",
  catalog_item_incomplete:
    "This listing is not finished yet, so it cannot go on the board. The listing screen says what is still missing.",
  catalog_photo_limit:
    "A listing holds eight sample photos. Remove one before adding another.",
  catalog_group_limit:
    "A listing holds six steps. Remove one before adding another.",
  catalog_option_limit:
    "A step holds twenty options. Remove one before adding another.",
  catalog_item_in_use:
    "A client has already ordered from this listing, so it is kept for that job's history. Hide it instead of removing it.",
};

export function humanizeApiError(error: unknown, fallback: string): string {
  if (error instanceof api.ApiError) {
    const body = error.body;
    const code =
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : "";
    const fields =
      typeof body === "object" && body && "fields" in body && body.fields && typeof body.fields === "object"
        ? Object.keys(body.fields as object)
        : [];
    if (code === "invalid_application" && fields.some((field) => field.startsWith("serviceCategories"))) {
      return "GRIDGO does not recognize one of the print categories you picked. Pull down to refresh and pick again.";
    }
    const known = MESSAGES[code];
    if (known) return known;
    if (error.status === 401) {
      return "Your session ended. Sign in again to continue.";
    }
    if (error.status === 404) {
      return MESSAGES.not_found;
    }
    if (error.status >= 500) {
      return "GRIDGO could not complete this. Wait a moment and try again.";
    }
    return fallback;
  }
  return fallback;
}

/** Supplier-role Clerk identity that the domain API will not project. */
export function supplierProjectionErrorMessage(error: unknown): string {
  if (error instanceof api.ApiError && (error.status === 401 || error.status === 403)) {
    return "No supplier account is connected to this sign-in. Sign out and apply as a shop, or ask Operations to check your invitation.";
  }
  return "GRIDGO could not open this supplier account. Try again, or ask Operations to check the invitation.";
}

/** Wording for a request that never reached the server at all. */
export function offlineMessage(subject: string): string {
  return `Cannot reach GRIDGO to ${subject}. Check this device's connection, then try again.`;
}
