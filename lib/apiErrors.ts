/** Shared with the transport without importing it back into its error helpers. */
export class ApiError extends Error {
  status: number;
  body: unknown;
  constructor(status: number, body: unknown) {
    super(
      typeof body === "object" && body && "error" in body
        ? String((body as { error: string }).error)
        : `HTTP ${status}`,
    );
    this.status = status;
    this.body = body;
  }
}

/**
 * Turn a demo-API failure into a sentence that names what happened and how to
 * fix it. No error code, state string, or snake_case identifier may reach the
 * screen — this module is the only place that reads them.
 */

/** A Clerk identity that GRIDGO will not project as a shop. */
export const supplierAccountNotFoundMessage =
  "No supplier account is connected to this sign-in. Apply as a shop, or ask Operations to check your invitation.";

export function apiErrorCode(error: unknown): string {
  if (!(error instanceof ApiError)) return "";
  const body = error.body;
  return typeof body === "object" && body && "error" in body
    ? String((body as { error: string }).error)
    : "";
}

/** Verified Clerk session, no GRIDGO user yet — open apply, do not treat as a dead token. */
export function isUnmappedIdentity(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401 && apiErrorCode(error) === "unmapped_identity";
}

/**
 * GRIDGO refused to let the job be packed because no production photo is on
 * it. The caller turns this into the photo step rather than a dead end.
 */
export function isProductionPhotoRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && apiErrorCode(error) === "production_photo_required";
}

/** The job left production while a finished-product photo was on its way; reload it. */
export function isFinishedPhotoNotAllowed(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 409) return false;
  const code = apiErrorCode(error);
  return code === "finished_product_photo_upload_not_allowed" || code === "production_finish_not_available";
}

export function isPackingPhotoRequired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && apiErrorCode(error) === "packing_photo_required";
}

/** The shop's record moved on since it was read (shop details and shop hours share one version). */
export function isSupplierProfileStale(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && apiErrorCode(error) === "supplier_profile_stale";
}

/** The job left production while a photo was on its way; reload it. */
export function isProductionPhotoUploadNotAllowed(error: unknown): boolean {
  return error instanceof ApiError && error.status === 409 && apiErrorCode(error) === "production_photo_upload_not_allowed";
}

/** Codes gridgo-api answers when an agreement could not be recorded (`docs/LEGAL_API.md`). */
const LEGAL_REFUSALS = new Set([
  "legal_consent_required",
  "legal_version_changed",
  "invalid_legal_versions",
  "invalid_acceptance_metadata",
  "unsupported_legal_consent_version",
  "legal_audience_mismatch",
]);

/** GRIDGO refused the agreement itself; nothing it was sent with was committed. */
export function isLegalRefusal(error: unknown): boolean {
  return error instanceof ApiError && LEGAL_REFUSALS.has(apiErrorCode(error));
}

/** A newer version took effect while the shop was reading. */
export function isLegalVersionChanged(error: unknown): boolean {
  return error instanceof ApiError && apiErrorCode(error) === "legal_version_changed";
}

/** Mapped GRIDGO identity that is not a shop. */
export function isNonSupplierIdentity(error: unknown): boolean {
  if (!(error instanceof ApiError) || error.status !== 403) return false;
  const code = apiErrorCode(error);
  return code === "supplier_account_not_found" || code === "membership_required";
}

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
  claim_hold_active:
    "A client claim is open on this job, so it cannot be packaged yet. Operations has to clear the claim first.",
  payout_held:
    "A client report or refund request is open on this job, so GRIDGO is holding what is left of your earnings until Operations settles it.",
  refund_fulfillment_stopped:
    "The client asked for a refund, so this job is paused. Do not continue it until Operations settles the refund with you.",
  refund_settlement_payout_hold:
    "A refund settlement replaced the rest of this job's payout. Operations sends the agreed settlement instead.",

  // Letting a job go, and asking for more time.
  shop_acceptance_expired:
    "The hour to answer this job has run out, so GRIDGO is passing it to another shop. It goes on your record as not answered in time.",
  decline_not_available:
    "This job is already accepted, so it cannot be declined. To give it back, cancel it from the job.",
  shop_cancel_reason_required: "Say why, in a sentence, then try again.",
  shop_cancel_not_available:
    "This job has left your counter, so it can no longer be cancelled here. Report a problem from the job instead.",
  shop_recovery_pending:
    "GRIDGO is already finding the client another shop for this job. Nothing more is needed from you.",
  reschedule_already_requested:
    "This job already has its one deadline request. Where it stands is on the job.",
  reschedule_not_available:
    "A new deadline can only be asked for while the job is in production, before it is marked ready.",
  reschedule_dates_missing:
    "GRIDGO has no ready-by on this job to move. Ask Operations to set it first.",
  invalid_reschedule_date: "Choose a time later than both now and your current ready-by.",
  invalid_reschedule_reason: "Tell the client why the job needs more time, in under 2,000 characters.",
  special_instructions_acknowledgement_required:
    "Read the special instructions and tick that you read them, then accept.",
  change_request_already_open:
    "This job already has a change request waiting. Where it stands is on the job.",
  change_request_pending:
    "This job has a change request waiting. Ask for a new deadline once the client has answered it.",
  reschedule_request_pending:
    "This job has a deadline request waiting. Ask for a change once the client has answered it.",
  change_request_window_closed:
    "A change can only be asked for before the job is marked ready. Refresh the job to see where it stands.",
  change_request_requires_committed_order:
    "This job is not paid for yet, so a change cannot be asked for. Refresh the job and try again.",
  change_request_multi_shop_legacy:
    "This job is shared with another shop, so GRIDGO handles changes to it. Report a problem with this job.",
  change_request_limit: "This job has had as many change requests as GRIDGO keeps. Report a problem with this job.",
  change_terms_required: "Say what you will do differently.",
  invalid_change_request: "Say what you will do differently and why, in the space given.",
  invalid_change_line: "That item is no longer on this job. Refresh the job and pick it again.",
  invalid_change_amount: "Enter the extra as an amount in pesos, or leave it empty for no extra.",
  invalid_print_layouts: "GRIDGO did not recognise one of the print layouts. Refresh the listing and mark them again.",
  change_request_idempotency_conflict: "This request was already sent with different details. Go back to the job and check it.",
  change_deadline_operations_required:
    "A late-production deduction already applies to this job, so GRIDGO handles changes to it. Report a problem with this job.",
  reschedule_fulfillment_stopped:
    "The client declined your new deadline, so this job is paused while GRIDGO sorts out the next step.",
  reschedule_operations_required:
    "Operations is deciding the next step on this job. Wait for them to contact you.",

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
  proof_limit_reached:
    "This part already has 50 photos, the most GRIDGO keeps. Message the GRIDGO Team if they need more.",
  packing_photo_required: "Add a photo of the finished prints packed and ready before marking Ready for dispatch.",
  packing_photo_upload_not_allowed: "This job has moved past packing. Refresh the job to see its latest step.",
  production_photo_required:
    "Add a photo of this job first. GRIDGO needs one before it can be packaged — your start-of-production photo counts, a PDF does not.",
  production_photo_upload_not_allowed:
    "This job has moved past production, so it no longer takes progress photos. Its latest step is on the job.",
  // The newer handover (docs/SHOP_HANDOVER_API.md): finished photos, GRIDGO's review, packing at the counter.
  finished_product_photo_required:
    "Add a photo of the finished, unpacked products first. Photos GRIDGO already reviewed cannot be sent again.",
  finished_product_photo_upload_not_allowed:
    "This job has moved past production, so it no longer takes finished-product photos. Its latest step is on the job.",
  production_finished_required:
    "Send photos of the finished, unpacked products for GRIDGO's review first.",
  production_review_required:
    "Wait for GRIDGO to approve the finished-product photos before calling a rider. Do not pack yet.",
  production_finish_not_available:
    "This job is not in production any more, so its finished photos cannot be sent. Its latest step is on the job.",
  handover_flow_not_available:
    "This job uses the older handover. Its next step is on the job.",
  pickup_held:
    "Something is holding this pickup. Operations has to clear it before the rider can take the job.",
  unpacked_inspection_required:
    "The rider checks the unpacked products first. Keep them unpacked until the checks pass.",
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
  listing_suspended:
    "GRIDGO took this listing down, so it cannot go back on the board from here. Only GRIDGO can put it back. Your other changes still save.",
  listing_incomplete:
    "This listing is not finished yet, so Operations cannot review it. The listing screen says what is still missing.",
  listing_already_approved:
    "Operations has already approved this listing. Change it and your changes go to Operations by themselves.",
  name_required: "Name the product type, in 120 characters or fewer.",
  description_required: "Say what the product type is, in 2,000 characters or fewer.",
  categoryCode_required: "Choose which of your categories it belongs under.",

  // The shop's own details.
  invalid_supplier_profile:
    "Some of your shop details are missing or not valid. Check the shop name, contact person and mobile number, then try again.",
  supplier_profile_stale:
    "Your shop details changed somewhere else while this screen was open. Load the latest, then make your change again.",
  expected_version_required:
    "GRIDGO could not tell which version of your details this change was made against. Load the latest and make the change again.",
  // The shop's hours (docs/SHOP_HOURS_API.md).
  invalid_shop_hours:
    "GRIDGO could not use those hours. Keep one opening and closing time on the same day, and closure dates that cover 90 dates or fewer.",
  production_day_length_unavailable:
    "Every open day needs the same number of hours for now. Pick one opening and closing time for all your open days.",
  invalid_shop_extension:
    "GRIDGO could not extend today to that time. Pick a time later than your usual close, before midnight, and at least 30 minutes from now.",
  shop_closed: "Your shop is temporarily closed. Reopen it before extending today's hours.",
  pickup_fulfillment_not_available:
    "Collecting from your counter is not switched on yet. Ask Operations to move this job to delivery.",
  email_not_editable:
    "Your email belongs to your GRIDGO sign-in, so it cannot be changed here. Change it where you sign in and it changes here too.",
};

/**
 * The completeness codes a refused review submission names
 * (`409 listing_incomplete` → `blockers`). `lib/listings.ts` says them in words.
 */
export function apiErrorBlockers(error: unknown): string[] {
  if (apiErrorCode(error) !== "listing_incomplete" || !(error instanceof ApiError)) return [];
  const body = error.body as { blockers?: unknown };
  return Array.isArray(body.blockers)
    ? body.blockers.filter((code): code is string => typeof code === "string")
    : [];
}

/**
 * A route this deployment does not have yet — distinct from a missing job.
 * Screens built ahead of the platform say so instead of reading as broken.
 */
export function isRouteNotOpen(error: unknown): boolean {
  if (!(error instanceof ApiError) || (error.status !== 404 && error.status !== 405)) return false;
  return apiErrorCode(error) !== "order_not_found";
}

/**
 * What a shop can do about one thing GRIDGO still needs before a step. The
 * shop's vocabulary, so no screen ever branches on the platform's code.
 */
export type RequirementKind =
  | "production_photo"
  | "packing_photo"
  /** Newer handover: photos of the finished, unpacked products. */
  | "finished_photos"
  /** Newer handover: GRIDGO's review of those photos. */
  | "review"
  | "claim"
  | "job_stopped"
  | "moved_on"
  | "other";

export type Requirement = { kind: RequirementKind; message: string };

const REQUIREMENT_KINDS: Record<string, RequirementKind> = {
  production_photo_required: "production_photo",
  packing_photo_required: "packing_photo",
  production_finished_required: "finished_photos",
  finished_product_photo_required: "finished_photos",
  production_review_required: "review",
  claim_hold_active: "claim",
  refund_fulfillment_stopped: "job_stopped",
  reschedule_fulfillment_stopped: "job_stopped",
  shop_recovery_pending: "job_stopped",
  transition_not_allowed: "moved_on",
};

/**
 * GRIDGO's own sentence, when it is one a shop can read. Its refusals now
 * carry a plain `message`; one that is only a code, or has a code in it, is
 * not shown — the shop gets this app's sentence for that code instead.
 */
function plainSentence(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || !/\s/.test(text) || /\b[a-z0-9]+_[a-z0-9_]+\b/.test(text)) return null;
  return text;
}

function requirementOf(raw: unknown): Requirement | null {
  if (typeof raw !== "object" || raw === null) return null;
  const code = typeof (raw as { code?: unknown }).code === "string" ? (raw as { code: string }).code : "";
  const message = plainSentence((raw as { message?: unknown }).message) ?? MESSAGES[code];
  if (!code && !message) return null;
  return {
    kind: REQUIREMENT_KINDS[code] ?? "other",
    message: message ?? "GRIDGO needs something else on this job first. Ask Operations what it is.",
  };
}

/**
 * Everything GRIDGO lists as still missing before a step
 * (gridgo-api `docs/SUPPLIER_JOB_READINESS_API.md`), in its order. The same
 * shape arrives in a job's `transitionReadiness` and in a refused step.
 */
export function readRequirements(value: unknown): Requirement[] {
  if (!Array.isArray(value)) return [];
  return value.map(requirementOf).filter((item): item is Requirement => item !== null);
}

/**
 * A step GRIDGO refused, in its own words: the sentence it answered with, and
 * every requirement still missing — not only the first. Null for anything that
 * is not a refusal (a dead connection, a server fault), which keeps its own
 * sentence from `humanizeApiError`.
 */
export function stepRefusal(error: unknown): { message: string; missing: Requirement[] } | null {
  if (!(error instanceof ApiError) || ![400, 403, 409].includes(error.status)) return null;
  const body = typeof error.body === "object" && error.body !== null ? (error.body as Record<string, unknown>) : {};
  const message = plainSentence(body.message) ?? MESSAGES[apiErrorCode(error)];
  if (!message) return null;
  return { message, missing: readRequirements(body.missing) };
}

export function humanizeApiError(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
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
    /*
     A refusal is not a dead connection.

     Most callers pass a sentence worth keeping — push explains that alerts
     still arrive in the app — and those stand. What cannot stand is an offline
     sentence: a shop pressing start on a job GRIDGO had deliberately refused
     was told to check its signal, checked a connection that was working, tried
     again, and got the same thing.

     So only that one is replaced, and only when the server demonstrably
     answered. The platform's code stays out of it — no snake_case reaches a
     screen in this app, and a shop cannot act on one anyway.
    */
    if (fallback.startsWith(OFFLINE_PREFIX)) {
      return "GRIDGO would not accept this, and nothing was changed. Try once more, and tell Operations if it keeps happening.";
    }
    return fallback;
  }
  return fallback;
}

/** Supplier-role Clerk identity that the domain API will not project. */
export function supplierProjectionErrorMessage(error: unknown): string {
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return "No supplier account is connected to this sign-in. Sign out and apply as a shop, or ask Operations to check your invitation.";
  }
  return "GRIDGO could not open this supplier account. Try again, or ask Operations to check the invitation.";
}

/**
 * How an offline sentence starts, so a refusal can be told from a dead line.
 *
 * `humanizeApiError` needs to know whether the fallback it was handed claims
 * the request never arrived. Comparing against this is what lets a caller with
 * a better sentence keep it while an offline one is corrected.
 */
const OFFLINE_PREFIX = "Cannot reach GRIDGO to ";

/** Wording for a request that never reached the server at all. */
export function offlineMessage(subject: string): string {
  return `${OFFLINE_PREFIX}${subject}. Check this device's connection, then try again.`;
}

/** Why a job's conversation with its rider cannot be shown (`lib/pickupChat.ts`). */
export type PickupChatUnavailable = { title: string; body: string };

/**
 * The conversation is gone or never opened, or null when the failure is
 * something a retry may fix (a dropped connection).
 */
export function pickupChatUnavailable(error: unknown): PickupChatUnavailable | null {
  const code = apiErrorCode(error);
  if (code === "pickup_chat_closed") {
    return {
      title: "These messages were removed",
      body: "Messages with the rider are removed one day after delivery. For anything about this job, message Operations.",
    };
  }
  if (code === "pickup_chat_not_available") {
    return {
      title: "No rider to message yet",
      body: "You can message the rider once one accepts the pickup. GRIDGO tells you when that happens.",
    };
  }
  if (code === "forbidden" || code === "order_not_found") {
    return {
      title: "This conversation is not available",
      body: "Only your shop and the rider collecting this job can read its messages.",
    };
  }
  return null;
}

/**
 * A named support thread this shop cannot open: removed, closed, or not its
 * own (`support_chat_thread_not_found`, `forbidden`). A dropped connection is
 * not this — a retry may fix it.
 */
export function supportThreadUnavailable(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 403 || error.status === 404 || error.status === 410);
}

/** Copy for a message to the rider that did not go through. */
export function pickupSendError(error: unknown): string {
  const code = apiErrorCode(error);
  if (code === "pickup_chat_read_only") return "This job has been delivered, so no new messages can be sent.";
  if (code === "too_many_requests") return "You are sending messages too fast. Wait a moment and try again.";
  if (code === "invalid_request") return "Write a message of up to 1,000 characters, or add a photo.";
  if (code === "invalid_chat_image" || code === "invalid_file_type" || code === "file_too_large") {
    return "That photo could not be sent. Choose a JPEG, PNG, or WebP of up to 15 MB.";
  }
  if (code === "file_already_attached") return "That photo was already sent. Choose it again to send it once more.";
  if (error instanceof Error && !(error instanceof ApiError) && error.message.startsWith("That photo")) {
    return error.message;
  }
  return "That did not reach the rider. Check your connection and send it again.";
}

/**
 * Why GRIDGO refused a call request (`lib/orderCall.ts`, gridgo-api
 * `docs/CALLS_API.md`), or null when a retry may fix it (a dropped connection).
 */
export type CallRefusal = "not_available" | "too_many" | "already_active" | "not_active" | "gone";

export function callRefusal(error: unknown): CallRefusal | null {
  const code = apiErrorCode(error);
  if (code === "call_not_available" || code === "forbidden" || code === "order_not_found") return "not_available";
  if (code === "too_many_requests") return "too_many";
  if (code === "call_already_active") return "already_active";
  if (code === "call_not_active" || code === "invalid_call_transition") return "not_active";
  if (code === "call_not_found" || code === "call_history_closed") return "gone";
  return null;
}
