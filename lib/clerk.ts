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
    throw new Error("Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to a Clerk publishable key.");
  }
  if (!development && !key.startsWith("pk_live_")) {
    throw new Error("Release builds require an EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY starting pk_live_.");
  }
  return key;
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
