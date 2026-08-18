/**
 * What a Clerk sign-up attempt asks for next.
 *
 * Same method-based `@clerk/expo` outcomes as GRIDGO Client: complete,
 * emailed code, or a leftover session. No `prepareFirstFactor`.
 */

export type SignUpContinuation =
  | { kind: "existing_session"; sessionId: string }
  | { kind: "complete" }
  | { kind: "email_code" }
  | { kind: "blocked"; message: string };

export type SignUpContinuationInput = {
  status?: string | null;
  unverifiedFields?: readonly string[] | null;
  missingFields?: readonly string[] | null;
  existingSession?: { sessionId: string } | null;
};

const FIELD_LABELS: Record<string, string> = {
  email_address: "an email address",
  phone_number: "a phone number",
  username: "a username",
  first_name: "a first name",
  last_name: "a last name",
  password: "a password",
  legal_accepted: "the terms accepted",
};

const GENERIC_BLOCKED =
  "Your account could not be created yet. Check your details and try again.";

export function missingSignUpFieldsMessage(
  missingFields?: readonly string[] | null,
): string {
  const labels = (missingFields ?? [])
    .map((field) => FIELD_LABELS[field])
    .filter((label): label is string => Boolean(label));
  if (labels.length === 0) return GENERIC_BLOCKED;
  const list =
    labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
  return `This account still needs ${list}. Add that and try again.`;
}

export function continuationAfterSignUp(
  input: SignUpContinuationInput,
): SignUpContinuation {
  if (input.existingSession?.sessionId) {
    return { kind: "existing_session", sessionId: input.existingSession.sessionId };
  }
  if (input.status === "complete") return { kind: "complete" };

  const unverified = input.unverifiedFields ?? [];
  if (unverified.includes("email_address")) return { kind: "email_code" };

  const missing = input.missingFields ?? [];
  if (missing.length > 0) {
    return { kind: "blocked", message: missingSignUpFieldsMessage(missing) };
  }

  if (unverified.length === 0) return { kind: "email_code" };

  return { kind: "blocked", message: GENERIC_BLOCKED };
}
