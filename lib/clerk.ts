export const GRIDGO_ROLES = [
  "client",
  "supplier",
  "rider",
  "ops_admin",
  "super_admin",
] as const;

export type GridgoRole = (typeof GRIDGO_ROLES)[number];

export type ClerkAccess =
  | { kind: "supplier" }
  | { kind: "unassigned" }
  | { kind: "mismatch"; destination: string };

const ROLE_SET = new Set<string>(GRIDGO_ROLES);
const PUBLISHABLE_KEY = /^pk_(test|live)_[A-Za-z0-9_-]+$/;

export function appForGridgoRole(role: Exclude<GridgoRole, "supplier">): string {
  switch (role) {
    case "client":
      return "GRIDGO for clients";
    case "rider":
      return "GRIDGO Rider";
    case "ops_admin":
    case "super_admin":
      return "the GRIDGO Operations portal";
  }
}

/**
 * Read the server-owned fleet role without widening what this binary accepts.
 * Missing, malformed and future values all fail closed as unassigned access.
 */
export function clerkAccessFor(metadata: unknown): ClerkAccess {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return { kind: "unassigned" };
  }

  const role = (metadata as Record<string, unknown>).gridgoRole;
  if (role === "supplier") return { kind: "supplier" };
  if (typeof role !== "string" || !ROLE_SET.has(role)) {
    return { kind: "unassigned" };
  }

  return {
    kind: "mismatch",
    destination: appForGridgoRole(role as Exclude<GridgoRole, "supplier">),
  };
}

/**
 * Validate the public key without ever echoing its value into an error.
 * Development may use either Clerk instance; a release must use Production.
 */
export function clerkPublishableKey(
  value: string | null | undefined,
  development: boolean,
): string {
  const key = value?.trim() ?? "";
  if (!PUBLISHABLE_KEY.test(key)) {
    throw new Error("Set a Clerk publishable key for this build.");
  }
  if (!development && !key.startsWith("pk_live_")) {
    throw new Error("Release builds require a Clerk publishable key starting pk_live_.");
  }
  return key;
}

/**
 * Extra is the preferred source (`app.config.ts` writes it at prebuild).
 * The static `process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY` read is the
 * Gradle-time fallback: Babel inlines that identifier while bundling, so
 * a release still ships the live value if extra was empty.
 */
export function resolveClerkPublishableKey(
  extra: unknown,
  development: boolean,
): string {
  const fromExtra = typeof extra === "string" ? extra : "";
  return clerkPublishableKey(
    fromExtra || process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY,
    development,
  );
}

/** True when Clerk refused a second session because one is already live. */
export function isAlreadySignedInError(error: unknown): boolean {
  const message = clerkErrorMessage(error, "").toLowerCase();
  return (
    message.includes("already signed in") ||
    message.includes("already logged in") ||
    message.includes("currently signed in") ||
    message.includes("currently logged in")
  );
}

/** True when Clerk is complaining that there is no session to act on. */
export function isClerkSignedOutError(error: unknown): boolean {
  const message = clerkErrorMessage(error, "").toLowerCase();
  if (!message) return false;
  return (
    message.includes("signed out") ||
    message.includes("logged out") ||
    message.includes("no active session") ||
    message.includes("session not found") ||
    message.includes("unable to authenticate")
  );
}

export type ClerkGetToken = (options?: { skipCache?: boolean }) => Promise<string | null | undefined>;

/**
 * Cached JWT first — a shop who just signed in already has one, and
 * skipCache on a phone can take longer than a short deadline, which used
 * to look like "GRIDGO could not confirm your sign-in".
 */
export const CLERK_CACHED_TOKEN_MS = 8_000;
/** Fresh Clerk refresh. Slow wifi must still finish; a hang must not. */
export const CLERK_TOKEN_ATTEMPT_MS = 12_000;

async function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("GRIDGO_DEADLINE")), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readClerkToken(
  getToken: ClerkGetToken,
  skipCache: boolean,
  ms: number,
): Promise<string | null> {
  try {
    const token =
      (
        await withDeadline(
          Promise.resolve().then(() => getToken(skipCache ? { skipCache: true } : undefined)),
          ms,
        )
      )?.trim() ?? "";
    return token || null;
  } catch {
    return null;
  }
}

export async function clerkSessionToken(getToken: ClerkGetToken): Promise<string | null> {
  return (
    (await readClerkToken(getToken, false, CLERK_CACHED_TOKEN_MS)) ??
    (await readClerkToken(getToken, true, CLERK_TOKEN_ATTEMPT_MS))
  );
}

/**
 * A completing Clerk step does not mint a JWT in the same tick. Sending
 * enroll with no Bearer is the same 401 an unmapped identity gets.
 */
export async function awaitClerkSessionToken(
  getToken: ClerkGetToken,
  attempts = 5,
  delayMs = 120,
): Promise<string | null> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const token = await clerkSessionToken(getToken);
    if (token) return token;
    if (attempt < attempts - 1) {
      await new Promise<void>((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return null;
}

/** First word is the given name; the rest is the family name if any. */
export function splitPersonName(value: string): { firstName: string; lastName?: string } {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  const firstName = parts.shift() ?? "";
  return parts.length ? { firstName, lastName: parts.join(" ") } : { firstName };
}

/** Pick Clerk's person-readable message without exposing codes or payloads. */
export function clerkErrorMessage(error: unknown, fallback: string): string {
  if (!error || typeof error !== "object") return fallback;
  const candidate = error as {
    errors?: Array<{ longMessage?: unknown; message?: unknown }>;
    message?: unknown;
  };
  const first = candidate.errors?.[0];
  if (typeof first?.longMessage === "string" && first.longMessage.trim()) {
    return first.longMessage;
  }
  if (typeof first?.message === "string" && first.message.trim()) {
    return first.message;
  }
  if (typeof candidate.message === "string" && candidate.message.trim()) {
    return candidate.message;
  }
  return fallback;
}
