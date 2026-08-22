import Constants from "expo-constants";
import { Platform } from "react-native";

import type { DevicePlatform } from "@/lib/push";

/**
 * GRIDGO demo API client.
 *
 * Points at the local `gridgo-api` server. Replace this module's base URL and
 * auth storage later when Clerk / Supabase land — keep call sites stable.
 */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";

/**
 * Where a shop stands with Operations. A shop is not matchable until
 * `approved`, and the API enforces that — this app only has to say so.
 */
export type VerificationStatus =
  | "unverified"
  | "pending"
  | "approved"
  | "suspended"
  | "rejected";

/** One category a shop declares, and how well it says it does it (1 = best). */
export type CategoryRank = {
  categoryCode: string;
  rank: number;
};

export type ShopLocation = { lat: number; lng: number; label: string };

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
  orgName?: string;
  supplierName?: string;
  shop?: ShopLocation | null;
  /** What the shop declared it does, best first. */
  categoryRanks?: CategoryRank[];
  verificationStatus?: VerificationStatus;
  /** Operations' own words on the decision. Safe to show. */
  verificationNote?: string | null;
  verifiedAt?: string | null;
};

/** `downpayment` is 75% of the client total; `balance` is the remaining 25%. */
export type InstallmentCode = "downpayment" | "balance";

/**
 * One half of the digital payment split.
 *
 * The client's own `reference` is withheld from this app by the server's role
 * projection, so it is absent from this type on purpose — a supplier never
 * sees how the client paid, only whether GRIDGO has the money.
 */
export type Installment = {
  amountMinor: number;
  method: string | null;
  status: "not_submitted" | "pending_confirmation" | "confirmed" | "legacy_confirmed";
  submittedAt: string | null;
  confirmedAt: string | null;
  confirmationSource: string | null;
};

/** The four parts the shop is paid in. Shares split the shop's own price. */
export type MilestoneCode = "printing" | "packaging_qc" | "delivered" | "retention";

export type PayoutMilestone = {
  code: MilestoneCode;
  sharePercent: number;
  /** The shop's own earnings for this part. Withheld from client and rider. */
  amountMinor: number;
  status: "pending_pof" | "pof_attached" | "released";
  /** Proof of Fulfilment files backing this part. */
  pofFileIds: string[];
  releasedAt: string | null;
};

export type Order = {
  id: string;
  clientId: string;
  supplierId: string | null;
  riderId: string | null;
  state: string;
  productId: string;
  title: string;
  quantity: number;
  size: string;
  material: string;
  finish?: string;
  deadline: string | null;
  address: string;
  zone: string;
  /** Shop pin the rider collects from. Set once a supplier is assigned. */
  pickup?: { lat: number; lng: number; label: string } | null;
  /**
   * The shop's own asking price. Present only for the assigned supplier —
   * GRIDGO's commission on top of it never reaches this app at all.
   */
  supplierPriceMinor?: number;
  /** Client-visible print subtotal. Includes commission the shop cannot see. */
  subtotalMinor?: number;
  totalMinor: number;
  deliveryFeeMinor: number;
  deliveryDistanceMeters?: number;
  downpaymentMinor?: number;
  balanceMinor?: number;
  paymentMethod: string | null;
  paymentStatus: string;
  payments?: Record<InstallmentCode, Installment>;
  payoutMilestones?: PayoutMilestone[];
  /** True while a claim holds every unreleased part of this payout. */
  payoutHold?: boolean;
  issueWindowOpenedAt?: string | null;
  issueWindowExpiresAt?: string | null;
  promisedDate: string | null;
  artworkName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Client artwork approved by QA. Read-only for this app. */
  artworkFileIds?: string[];
  /** Every Proof of Fulfilment on this job, from this shop and the rider. */
  fulfilmentProofFileIds?: string[];
  deliveryPhotoFileIds?: string[];
  timeline: {
    at: string;
    state: string;
    by: string;
    note: string;
    /** Present on evidence entries. */
    fileId?: string;
  }[];
};

/** A client's report against a delivered job. It is what holds a payout. */
export type Issue = {
  id: string;
  orderId: string;
  description: string;
  kind: string;
  status: string;
  consequence: string;
  createdAt: string;
  resolvedAt: string | null;
  resolution: string | null;
};

/** Platform-wide operational settings. The issue window is the one this app reads. */
export type Settings = {
  issueWindowHours: number;
  deliveryFeeBands: { maxDistanceMeters: number | null; feeMinor: number }[];
};

/** Stored file metadata. `fileId` is the only durable identity a client keeps. */
export type StoredFile = {
  fileId: string;
  /** `verification_document` is provisional — see the note above `logout`. */
  purpose:
    | "artwork"
    | "fulfilment_proof"
    | "delivery_photo"
    | "service_image"
    | "verification_document"
    /** A sample photo on one of the shop's own listings. Provisional. */
    | "catalog_item_photo";
  originalFilename: string;
  declaredContentType: string;
  detectedContentType: string;
  size: number;
  ownerId: string;
  state: "pending_upload" | "ready" | "delete_pending" | "deleted";
  createdAt: string;
  readyAt: string | null;
  references: { type: string; id: string; field: string }[];
};

/** A short-lived capability, never file identity. Do not persist or rewrite. */
export type DownloadUrl = {
  fileId: string;
  url: string;
  expiresAt: string;
  expiresInSeconds: number;
};

export type Notification = {
  id: string;
  userId: string;
  /** Platform event name. Never shown; used to place an alert on a job. */
  type?: string;
  /** Set when the alert is about a job. */
  orderId?: string;
  title: string;
  body: string;
  /** Broadcast picture. Public HTTPS link or `/public/announcement-images/<fileId>`. */
  imageUrl?: string | null;
  read: boolean;
  at: string;
};

/**
 * A phone registered to receive push.
 *
 * The raw token is never returned by any route: `tokenTail` is its last eight
 * characters, which is enough to recognise a registration in a support
 * conversation and not enough to send to it.
 */
export type Device = {
  id: string;
  userId: string;
  platform: DevicePlatform;
  tokenTail: string;
  createdAt: string;
  updatedAt: string;
};

/** One entry of the platform-wide vocabulary served by `GET /taxonomy`. */
export type TaxonomyCategory = {
  id: string;
  code: string;
  name: string;
  productFamilyIds: string[];
  active: boolean;
};

export type TaxonomyTerm = {
  id: string;
  code: string;
  name: string;
  categoryCodes: string[];
  active: boolean;
};

export type Taxonomy = {
  categories: TaxonomyCategory[];
  materials: TaxonomyTerm[];
  finishes: TaxonomyTerm[];
};

/** A capability line the shop is accredited for — the capacity the app edits. */
export type SupplierService = {
  id: string;
  supplierId: string;
  categoryCode: string;
  materialCodes: string[];
  finishCodes: string[];
  productFamilyIds: string[];
  sizeMin: string | null;
  sizeMax: string | null;
  qtyMin: number | null;
  qtyMax: number | null;
  pricingBasis: string;
  referenceRateMinor: number;
  turnaroundHours: number;
  capacityDaily: number | null;
  capacityWeekly: number | null;
  zones: string[];
  equipmentNotes: string;
  imageFileIds?: string[];
  state: string;
  verifiedAt: string | null;
  suspendedAt: string | null;
  suspendReason: string | null;
  withdrawnAt: string | null;
  createdAt: string;
  updatedAt: string;
};

/**
 * Fields this app is allowed to change on a service line.
 *
 * Widening `materialCodes` on a verified line sends it back to Operations for
 * verification — that is the platform's rule, not this app's, and the screen
 * must say so before the shop saves.
 */
export type SupplierServicePatch = {
  capacityDaily?: number;
  capacityWeekly?: number;
  turnaroundHours?: number;
  materialCodes?: string[];
  finishCodes?: string[];
};

let tokenMemory: string | null = null;
export type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;

/** Inputs for pure API-base resolution (exported for unit tests). */
export type ResolveApiBaseInput = {
  /** Explicit override (`EXPO_PUBLIC_API_URL`). Wins when non-empty. */
  envUrl?: string | null;
  /** API port (`EXPO_PUBLIC_API_PORT`), default 8787. */
  envPort?: string | null;
  /**
   * Dev-server host strings from expo-constants (`host:port`, URLs, etc.).
   * First parseable hostname wins.
   */
  hostCandidates?: Array<string | null | undefined>;
  /** `Platform.OS` value used for the Android emulator loopback remap. */
  platformOS?: string;
  /**
   * `false` only for an Android emulator. Loopback then becomes `10.0.2.2`.
   * A physical phone (or unknown) keeps IPv4 loopback so USB reverse of
   * `:8787` works on any Wi-Fi without baking a LAN address into the app.
   */
  isDevice?: boolean;
};

/**
 * Pull hostname from an Expo host field (`192.168.1.55:8081`,
 * `exp://192.168.1.55:8081`, full URLs). Drops the packager port.
 */
export function hostnameFromHostUri(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(trimmed)
      ? trimmed
      : `http://${trimmed}`;
    const hostname = new URL(withScheme).hostname;
    return hostname || null;
  } catch {
    // host:port or bare host without a parseable URL shape
    const hostPart = trimmed.split("/")[0]?.split(":")[0]?.trim();
    return hostPart || null;
  }
}

/** Collect populated host fields across Expo Go, dev builds, and legacy manifests. */
function collectExpoHostCandidates(): Array<string | null | undefined> {
  const manifest = Constants.manifest as { debuggerHost?: string; hostUri?: string } | null;
  const manifest2 = Constants.manifest2 as {
    extra?: { expoClient?: { hostUri?: string; debuggerHost?: string } };
  } | null;

  return [
    Constants.expoConfig?.hostUri,
    Constants.platform?.hostUri,
    Constants.expoGoConfig &&
      typeof Constants.expoGoConfig === "object" &&
      "debuggerHost" in Constants.expoGoConfig
      ? String((Constants.expoGoConfig as { debuggerHost?: string }).debuggerHost ?? "")
      : null,
    manifest2?.extra?.expoClient?.hostUri,
    manifest2?.extra?.expoClient?.debuggerHost,
    manifest?.debuggerHost,
    manifest?.hostUri,
    Constants.linkingUri,
    Constants.experienceUrl,
  ];
}

/**
 * Resolve the demo API base URL.
 *
 * Precedence:
 * 1. Non-empty `envUrl` (trailing slash stripped)
 * 2. Hostname from Expo dev-server host candidates → `http://<host>:<port>`
 * 3. If that host is loopback and platform is Android:
 *    emulator (`isDevice === false`) → `http://10.0.2.2:<port>`
 *    physical phone / unknown → `http://127.0.0.1:<port>` (USB reverse is IPv4)
 * 4. `http://127.0.0.1:<port>`
 */
export function resolveApiBase(input: ResolveApiBaseInput = {}): string {
  const envUrl = input.envUrl?.trim().replace(/\/$/, "");
  if (envUrl) return envUrl;

  const port = input.envPort?.trim() || "8787";
  const candidates = input.hostCandidates ?? [];
  let host: string | null = null;
  for (const candidate of candidates) {
    host = hostnameFromHostUri(candidate);
    if (host) break;
  }

  if (host) {
    const loopback = host === "localhost" || host === "127.0.0.1";
    if (loopback && input.platformOS === "android") {
      if (input.isDevice === false) {
        return `http://10.0.2.2:${port}`;
      }
      // `localhost` can resolve to IPv6 ::1; adb reverse only tunnels IPv4.
      return `http://127.0.0.1:${port}`;
    }
    return `http://${host}:${port}`;
  }

  return `http://127.0.0.1:${port}`;
}

export function getApiBase(): string {
  return resolveApiBase({
    envUrl: process.env.EXPO_PUBLIC_API_URL,
    envPort: process.env.EXPO_PUBLIC_API_PORT,
    hostCandidates: collectExpoHostCandidates(),
    platformOS: Platform.OS,
    isDevice: Constants.isDevice,
  });
}

/** In-app picture URL. Hosted broadcast paths resolve against this app's API. */
export function notificationImageUrl(imageUrl?: string | null): string | null {
  const value = typeof imageUrl === "string" ? imageUrl.trim() : "";
  if (!value) return null;
  if (value.startsWith("/")) return `${getApiBase().replace(/\/$/, "")}${value}`;
  return value;
}

export function setToken(token: string | null): void {
  tokenMemory = token;
}

export function getToken(): string | null {
  return tokenMemory;
}

/**
 * Let Clerk own token issuance without changing the API surface screens call.
 * Passing a provider also drops any legacy bearer, so a missing Clerk token can
 * never fall back to a different identity left in memory.
 */
export function setTokenProvider(provider: TokenProvider | null): void {
  tokenProvider = provider;
  if (provider) tokenMemory = null;
}

/** Fresh for every request; Clerk session JWTs rotate while the app is open. */
export async function getAuthToken(): Promise<string | null> {
  if (!tokenProvider) return tokenMemory;
  const token = await tokenProvider();
  tokenMemory = token;
  return token;
}

/** Fired when an authenticated request gets HTTP 401 (token gone or invalid). */
export type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/**
 * Register the session-clearing callback. The store wires this once so a 401
 * drops `user` and the root `Stack.Protected` guard handles navigation.
 */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null): void {
  unauthorizedHandler = handler;
}

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

type RequestOptions = RequestInit & {
  /**
   * Skip the session-clearing 401 handler. Needed when a Clerk JWT is live
   * but GRIDGO has not projected a supplier yet — enroll asks `/auth/me`
   * first, and treating that 401 as "sign the shop out" would drop the
   * session we are about to enroll.
   */
  ignoreUnauthorized?: boolean;
};

/** GRIDGO must fail an apply rather than spin until the shop force-closes. */
export const API_REQUEST_MS = 20_000;

async function request<T>(path: string, init: RequestOptions = {}): Promise<T> {
  const { ignoreUnauthorized, ...fetchInit } = init;
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(fetchInit.headers as Record<string, string> | undefined),
  };
  if (fetchInit.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_REQUEST_MS);
  const aborted = new Promise<never>((_, reject) => {
    const fail = () => {
      const error = new Error("Aborted");
      error.name = "AbortError";
      reject(error);
    };
    if (controller.signal.aborted) fail();
    else controller.signal.addEventListener("abort", fail, { once: true });
  });
  let res: Response;
  try {
    const token = await Promise.race([getAuthToken(), aborted]);
    if (token) headers.Authorization = `Bearer ${token}`;
    res = await fetch(`${getApiBase()}${path}`, {
      ...fetchInit,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    const timedOut =
      (error instanceof Error && error.name === "AbortError") ||
      (typeof error === "object" && error !== null && "name" in error && error.name === "AbortError");
    if (timedOut) {
      throw new Error("GRIDGO did not answer in time. Check this phone’s connection, then try again.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!res.ok) {
    // Clear the bearer on any 401 so a stale token cannot keep calling APIs.
    // The session store's unauthorized handler then nulls `user` and the root
    // route guard unmounts the signed-in area (no per-screen redirects).
    if (res.status === 401 && !ignoreUnauthorized) {
      setToken(null);
      unauthorizedHandler?.();
    }
    throw new ApiError(res.status, data);
  }
  return data as T;
}

export async function login(email: string, password: string): Promise<{ token: string; user: User }> {
  const result = await request<{ token: string; user: User }>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  setToken(result.token);
  return result;
}

/**
 * Public shop application — `POST /auth/clerk/enroll/supplier`.
 *
 * Body is exact: extra fields (`role`, `password`, `email`, `categoryRanks`)
 * are rejected. Clerk owns the identity; this only files the shop profile.
 */
export type SupplierEnrollment = {
  profile: {
    shopName: string;
    contactName: string;
    phone: string;
    location: ShopLocation;
  };
  serviceCategories: string[];
};

/**
 * Open a pending shop account from a live Clerk session.
 *
 * Caller must already have a Clerk JWT on the token provider. The enroll
 * response is a membership projection, not the supplier `User` this app
 * hydrates — `/auth/me` is the adopt step.
 */
export async function enrollSupplier(
  input: SupplierEnrollment,
  idempotencyKey: string,
): Promise<User> {
  await request("/auth/clerk/enroll/supplier", {
    method: "POST",
    headers: { "Idempotency-Key": idempotencyKey },
    body: JSON.stringify(input),
  });
  return me({ ignoreUnauthorized: true });
}

/* --------------------------------------------------------------------------
   Provisional routes

   Two things a shop does for itself are being added to the platform in
   parallel with this app: moving its own pin, and sending Operations the
   papers that accredit it. Neither is in `docs/OPERATIONAL_MODEL_V2_API.md`
   yet, so the shapes below are the documented ones extended the obvious way —
   `shop { lat, lng, label }` exactly as enroll already accepts it,
   and the storage contract's own upload-then-attach pair.

   `lib/verification.ts` is the only caller and it treats a missing route as a
   fact to state rather than an error to swallow. When the platform lands
   these, this block is what changes.
   -------------------------------------------------------------------------- */

/**
 * Provisional. Mark one of the caller's own notifications read.
 *
 * The record has carried a `read` flag since v2; nothing could set it. These
 * three are the routes that close that gap.
 */
export async function markNotificationRead(id: string): Promise<Notification> {
  const result = await request<{ notification: Notification }>(
    `/notifications/${id}/read`,
    { method: "POST", body: "{}" },
  );
  return result.notification;
}

/**
 * Provisional. Mark a named set read.
 *
 * The ids are explicit on purpose. A bodyless "mark everything" would also
 * mark alerts that arrived while the shop was reading the screen — things it
 * has never seen — and a read flag that lies is worse than no read flag.
 */
export async function markNotificationsRead(ids: string[]): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications/read", {
    method: "POST",
    body: JSON.stringify({ ids }),
  });
  return result.notifications;
}

/** Provisional. Delete one of the caller's own notifications. */
export async function deleteNotification(id: string): Promise<void> {
  await request(`/notifications/${id}`, { method: "DELETE" });
}

/** Provisional. Move the signed-in shop's own pin. */
export async function updateShopLocation(shop: ShopLocation): Promise<User> {
  const result = await request<{ user: User }>("/auth/me/shop", {
    method: "PATCH",
    body: JSON.stringify({ shop }),
  });
  return result.user;
}

/**
 * Provisional. Bind an uploaded file to the caller's own pending accreditation.
 *
 * Uploading uses the ordinary `POST /files` route with a
 * `verification_document` purpose; this is the second half of that pair.
 */
export async function attachVerificationDocument(
  fileId: string,
  documentKind: string,
): Promise<StoredFile> {
  const result = await request<{ file: StoredFile }>(`/files/${fileId}/attach`, {
    method: "POST",
    body: JSON.stringify({ documentKind }),
  });
  return result.file;
}

/**
 * Sign out, and stop this phone receiving the account's push in the same call.
 *
 * The device token goes with the sign-out rather than through
 * `POST /devices/unregister` for a sequencing reason the contract is explicit
 * about: after logout the bearer token is invalid, so a phone that signs out
 * first can no longer authenticate an unregister and would keep waking for the
 * previous shop's job offers. Sending no token stays valid and behaves exactly
 * as it did before push existed.
 *
 * `deviceUnregistered` is `false` — with a `200` and a completed sign-out —
 * when no token was sent, the session had already expired, or the token now
 * belongs to somebody else. None of those is a failure worth showing anyone.
 */
export async function logout(deviceToken?: string | null): Promise<void> {
  try {
    await request("/auth/logout", {
      method: "POST",
      body: JSON.stringify(deviceToken ? { deviceToken } : {}),
    });
  } finally {
    setToken(null);
  }
}

/**
 * Register this installation's FCM token against the signed-in shop.
 *
 * Idempotent and cheap by design, so it is called on every launch and on every
 * token refresh: re-registering the same token under the same account updates
 * the one record, and registering a token held by another account **moves** it,
 * which is what a counter handset shared between a shop and its owner
 * produces. `201` means the token was new, `200` that it was updated or moved
 * — both are success, so only the body is read.
 */
export async function registerDevice(
  token: string,
  platform: DevicePlatform,
): Promise<{ device: Device; created: boolean; reassigned: boolean }> {
  return request<{ device: Device; created: boolean; reassigned: boolean }>("/devices", {
    method: "POST",
    body: JSON.stringify({ token, platform }),
  });
}

/**
 * Provisional. Register this phone **before anyone has signed in**.
 *
 * A shop that installs GRIDGO and does not sign in for a week is still a phone
 * GRIDGO needs to reach — "there is a new version, update your app" is exactly
 * the announcement that must land on a handset with no session. `POST /devices`
 * requires a bearer today; the platform is opening it to an unauthenticated
 * caller in parallel with this app, registering the token **unclaimed**. Signing
 * in then claims it through the ordinary {@link registerDevice}, because the
 * contract already moves a token from one owner to another on registration.
 *
 * Two deliberate differences from every other call in this module:
 *
 * - It never sends a bearer, even when one exists. A claimed registration is
 *   {@link registerDevice}'s job, and mixing the two would make which one ran
 *   depend on timing.
 * - It does not go through `request()`, so its `401` cannot clear the session.
 *   A deployment without this route answers `401`, and routing that through the
 *   unauthorized handler would sign a shop out because a *provisional* route is
 *   not live yet. `lib/push.ts`'s caller reads the status and treats `401`,
 *   `403`, `404` and `405` as "not open yet" rather than a failure.
 *
 * Throws {@link ApiError} exactly as `request()` would, so callers read one
 * shape.
 */
export async function registerDeviceUnclaimed(
  token: string,
  platform: DevicePlatform,
): Promise<void> {
  const res = await fetch(`${getApiBase()}/devices`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ token, platform }),
  });
  if (!res.ok) {
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    throw new ApiError(res.status, data);
  }
}

/** The caller's own registrations, always — there is no route to anyone else's. */
export async function listDevices(): Promise<Device[]> {
  const result = await request<{ devices: Device[] }>("/devices");
  return result.devices;
}

/**
 * Drop one registration.
 *
 * Prefer passing the token to {@link logout}. This exists for the case where
 * the session is still valid and only push is being turned off. A token
 * registered to a different account returns `404`, exactly as an unregistered
 * one does, so that asking cannot answer "is this token someone else's?".
 */
export async function unregisterDevice(token: string): Promise<void> {
  await request("/devices/unregister", {
    method: "POST",
    body: JSON.stringify({ token }),
  });
}

export async function me(options: { ignoreUnauthorized?: boolean } = {}): Promise<User> {
  const result = await request<{ user: User }>("/auth/me", {
    ignoreUnauthorized: options.ignoreUnauthorized,
  });
  return result.user;
}

export async function listOrders(): Promise<Order[]> {
  const result = await request<{ orders: Order[] }>("/orders");
  return result.orders;
}

export async function listJobs(): Promise<Order[]> {
  const result = await request<{ jobs: Order[] }>("/jobs");
  return result.jobs;
}

export async function getOrder(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}`);
  return result.order;
}

/** Issues clients have raised on this shop's own jobs. A live one holds payout. */
export async function listIssues(orderId?: string): Promise<Issue[]> {
  const query = orderId ? `?orderId=${encodeURIComponent(orderId)}` : "";
  const result = await request<{ issues: Issue[] }>(`/issues${query}`);
  return result.issues;
}

/** Platform-wide settings. Read for the issue-window length, never assumed. */
export async function getSettings(): Promise<Settings> {
  const result = await request<{ settings: Settings }>("/settings");
  return result.settings;
}

export async function transitionOrder(
  orderId: string,
  state: string,
  extra: Record<string, unknown> = {},
): Promise<Order> {
  const result = await request<{ order: Order }>(`/orders/${orderId}/transition`, {
    method: "POST",
    body: JSON.stringify({ state, ...extra }),
  });
  return result.order;
}

export async function getTaxonomy(): Promise<Taxonomy> {
  const result = await request<{ taxonomy: Taxonomy }>("/taxonomy");
  return result.taxonomy;
}

/** The signed-in shop's own service lines (the API scopes this by bearer). */
export async function listSupplierServices(): Promise<SupplierService[]> {
  const result = await request<{ services: SupplierService[] }>("/supplier-services");
  return result.services;
}

export async function updateSupplierService(
  serviceId: string,
  patch: SupplierServicePatch,
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}`,
    { method: "PATCH", body: JSON.stringify(patch) },
  );
  return result.service;
}

/** Declare a capability line. It lands as a draft until the shop submits it. */
export async function createSupplierService(
  categoryCode: string,
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>("/supplier-services", {
    method: "POST",
    body: JSON.stringify({ categoryCode }),
  });
  return result.service;
}

/** Hand a line to Operations for verification. */
export async function submitSupplierService(serviceId: string): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}/submit`,
    { method: "POST", body: "{}" },
  );
  return result.service;
}

/** Stop offering a line. In-flight jobs are unaffected. */
export async function withdrawSupplierService(
  serviceId: string,
): Promise<SupplierService> {
  const result = await request<{ service: SupplierService }>(
    `/supplier-services/${serviceId}/withdraw`,
    { method: "POST", body: "{}" },
  );
  return result.service;
}

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications");
  return result.notifications;
}

/**
 * Object storage the API may or may not have. `storage` is absent on API
 * builds without file support — the app must treat that as "unavailable"
 * rather than assuming an upload route exists.
 */
export type Health = {
  ok: boolean;
  storage?: { status: "checking" | "available" | "unavailable" | "initializing" };
};

export async function health(): Promise<Health> {
  return request("/health");
}

/**
 * Bind an uploaded file to one payout milestone as its Proof of Fulfilment.
 *
 * This is what makes a milestone releasable; the upload alone changes nothing,
 * and the job's own state does not move. A file can back one record only, so
 * each milestone needs its own upload.
 */
export async function attachFulfilmentProof(
  fileId: string,
  orderId: string,
  milestoneCode: MilestoneCode,
): Promise<{ file: StoredFile; order: Order }> {
  return request(`/files/${fileId}/attach`, {
    method: "POST",
    body: JSON.stringify({ orderId, milestoneCode }),
  });
}

export async function getFile(fileId: string): Promise<StoredFile> {
  const result = await request<{ file: StoredFile }>(`/files/${fileId}`);
  return result.file;
}

/** Short-lived signed URL. Request a fresh one rather than caching it. */
export async function getDownloadUrl(fileId: string): Promise<DownloadUrl> {
  return request(`/files/${fileId}/download-url`);
}


/* --------------------------------------------------------------------------
   The shop's own board — listings

   The contract is `docs/SUPPLIER_CATALOG_API.md` in gridgo-api. Read it before
   touching anything here; nothing below invents a path.

   Two shapes run through every call:

   - These return the response body as `unknown`. `lib/listings.ts` is the only
     place that reads a listing's shape, exactly as `lib/taxonomy.ts` is the
     only place that reads the chart's — so a field the platform renames costs
     one normaliser, not fifteen screens.
   - **Every mutation of an existing record carries its version**, as both
     `expectedVersion` in the body and `If-Match` in the header, or GRIDGO
     answers `400 expected_version_required`. Which record's version depends on
     what is being changed: the *item* for the listing, its formats, its photos
     and for creating a group; the *group* for renaming it, deleting it, and for
     every option inside it. Getting that wrong is a `409`, not a silent write.
   -------------------------------------------------------------------------- */

/** Body plus `If-Match`. GRIDGO accepts either; sending both is unambiguous. */
function versioned(
  version: number | null | undefined,
  body: Record<string, unknown> = {},
): RequestOptions {
  const init: RequestOptions = { body: JSON.stringify({ ...body, expectedVersion: version }) };
  if (version != null) init.headers = { "If-Match": String(version) };
  return init;
}

/**
 * What the shop asks its own board for.
 *
 * Every one of these is a GRIDGO predicate, not a local `.filter` — the hunt,
 * the kind of work, on-the-board vs hidden and the sort all run in PostgreSQL
 * so a shop with two hundred samples does not download two hundred samples to
 * look at eight. `docs/SUPPLIER_CATALOG_API.md` in gridgo-api is the contract.
 */
export type CatalogListQuery = {
  /** The hunt. Trimmed and capped at 80 by GRIDGO; blank is the whole board. */
  q?: string | null;
  sort?: string | null;
  subcategoryCode?: string | null;
  /** True for on the board, false for hidden, null/undefined for both. */
  active?: boolean | null;
  /** Page size. GRIDGO defaults to 20 and refuses more than 50. */
  limit?: number | null;
  /** An opaque `nextCursor` from the page before this one. */
  cursor?: string | null;
};

/**
 * Every listing this shop owns, draft and on-the-board alike, one page at a
 * time. Answers `{ items, total, nextCursor? }`.
 */
export async function listCatalogItems(query: CatalogListQuery = {}): Promise<unknown> {
  const params = new URLSearchParams();
  const q = (query.q ?? "").trim();
  if (q) params.set("q", q);
  if (query.sort) params.set("sort", query.sort);
  if (query.subcategoryCode) params.set("subcategoryCode", query.subcategoryCode);
  if (query.active != null) params.set("active", query.active ? "true" : "false");
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const search = params.toString();
  return request<unknown>(`/me/catalog-items${search ? `?${search}` : ""}`);
}

export async function getCatalogItem(itemId: string): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}`);
}

/**
 * The shop's own accreditation lines, as the catalog contract projects them.
 *
 * `/supplier-services` is the older route the accreditation screens use and it
 * carries no `acceptedFormats`, which is exactly what a listing inherits — so
 * the board reads the `/me` projection instead of guessing that a line accepts
 * nothing.
 */
export async function listMyCatalogServices(): Promise<unknown> {
  return request<unknown>("/me/supplier-services");
}

/**
 * Open a listing. `starterId` clones a GRIDGO starter's steps and add-ons into
 * the shop's own rows at create time; without one the listing starts blank.
 */
export async function createCatalogItem(body: Record<string, unknown>): Promise<unknown> {
  return request<unknown>("/me/catalog-items", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateCatalogItem(
  itemId: string,
  version: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    ...versioned(version, body),
  });
}

/**
 * Take a listing off the shop.
 *
 * A listing a client has already ordered from is archived rather than deleted,
 * and GRIDGO says which by what it returns: the archived item, or `{ ok: true }`.
 * The caller has to tell the shop which happened — "gone" and "kept for a job
 * you already have" are different facts.
 */
export async function deleteCatalogItem(
  itemId: string,
  version: number | null,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}`, {
    method: "DELETE",
    ...versioned(version),
  });
}

/**
 * Replace the listing's accepted-format set.
 *
 * `mode` is the field GRIDGO reads: `inherit` keeps no item rows and follows
 * the service line, `override` requires at least one active governed code.
 */
export async function putCatalogItemFileFormats(
  itemId: string,
  version: number | null,
  mode: "inherit" | "override",
  formatCodes: string[],
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/file-formats`, {
    method: "PUT",
    ...versioned(version, { mode, formatCodes }),
  });
}

/**
 * Open a step or an add-on.
 *
 * GRIDGO will not create an empty group — a step with nothing to choose is a
 * dead end on a client's screen — so the first option goes in the same call.
 */
export async function createCatalogOptionGroup(
  itemId: string,
  itemVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/option-groups`, {
    method: "POST",
    ...versioned(itemVersion, body),
  });
}

export async function updateCatalogOptionGroup(
  itemId: string,
  groupId: string,
  groupVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/option-groups/${encodeURIComponent(groupId)}`,
    { method: "PATCH", ...versioned(groupVersion, body) },
  );
}

export async function deleteCatalogOptionGroup(
  itemId: string,
  groupId: string,
  groupVersion: number | null,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/option-groups/${encodeURIComponent(groupId)}`,
    { method: "DELETE", ...versioned(groupVersion) },
  );
}

export async function createCatalogOption(
  groupId: string,
  groupVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-option-groups/${encodeURIComponent(groupId)}/options`, {
    method: "POST",
    ...versioned(groupVersion, body),
  });
}

export async function updateCatalogOption(
  groupId: string,
  optionId: string,
  groupVersion: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-option-groups/${encodeURIComponent(groupId)}/options/${encodeURIComponent(optionId)}`,
    { method: "PATCH", ...versioned(groupVersion, body) },
  );
}

export async function deleteCatalogOption(
  groupId: string,
  optionId: string,
  groupVersion: number | null,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-option-groups/${encodeURIComponent(groupId)}/options/${encodeURIComponent(optionId)}`,
    { method: "DELETE", ...versioned(groupVersion) },
  );
}

/**
 * Set the order of a listing's sample photos. The first id is the board thumb.
 *
 * GRIDGO requires the **whole current set**, so this reorders and nothing else
 * — a shorter list is rejected as stale rather than quietly dropping a sample.
 */
export async function reorderCatalogItemPhotos(
  itemId: string,
  version: number | null,
  fileIds: string[],
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/photos/reorder`, {
    method: "POST",
    ...versioned(version, { fileIds }),
  });
}

/**
 * Bind an uploaded photo to one listing.
 *
 * Attaching at a `sortOrder` a photo already holds **replaces** that photo,
 * which is the only way a sample comes off a listing: the contract has no
 * detach, and an attached file cannot be deleted while it is referenced.
 */
export async function attachCatalogItemPhoto(
  fileId: string,
  catalogItemId: string,
  sortOrder: number,
  altText?: string,
): Promise<unknown> {
  const body: Record<string, unknown> = { catalogItemId, sortOrder };
  if (altText) body.altText = altText;
  return request<unknown>(`/files/${encodeURIComponent(fileId)}/attach`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

/**
 * GRIDGO's own starters for one kind of work.
 *
 * Platform seed data, not records the shop mutates: creating from one copies
 * its steps and add-ons into the shop's own rows, and the starter is never
 * referenced again.
 */
export async function listListingStarters(subcategoryCode: string): Promise<unknown> {
  return request<unknown>(
    `/listing-starters?subcategoryCode=${encodeURIComponent(subcategoryCode)}`,
  );
}

/* --------------------------------------------------------------------------
   What a client does before it sends work

   `docs/SUPPLIER_CATALOG_API.md` carries these now: a collection under the
   item, its member route, a reorder route, and the **item's** version on every
   write. A listing holds at most eight.

   They are still the newest thing on GRIDGO, so `lib/listingsApi.ts` — the only
   caller — keeps treating a missing route as a fact to state rather than an
   error to swallow. A deployment that has not caught up says so; it does not
   turn red.
   -------------------------------------------------------------------------- */

export async function listPrepSteps(itemId: string): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps`);
}

export async function createPrepStep(
  itemId: string,
  version: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(`/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps`, {
    method: "POST",
    ...versioned(version, body),
  });
}

export async function updatePrepStep(
  itemId: string,
  stepId: string,
  version: number | null,
  body: Record<string, unknown>,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps/${encodeURIComponent(stepId)}`,
    { method: "PATCH", ...versioned(version, body) },
  );
}

export async function deletePrepStep(
  itemId: string,
  stepId: string,
  version: number | null,
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps/${encodeURIComponent(stepId)}`,
    { method: "DELETE", ...versioned(version) },
  );
}

/**
 * Put the prep steps in the order a client should read them.
 *
 * The whole current set goes with it, exactly as the photo reorder does, and a
 * set that no longer matches is refused as stale rather than half-applied. This
 * is also why a step never moves by patching one position: two steps swapping
 * would collide on the position they are passing through.
 */
export async function reorderPrepSteps(
  itemId: string,
  version: number | null,
  stepIds: string[],
): Promise<unknown> {
  return request<unknown>(
    `/me/catalog-items/${encodeURIComponent(itemId)}/prep-steps/reorder`,
    { method: "POST", ...versioned(version, { stepIds }) },
  );
}

/* --------------------------------------------------------------------------
   Provisional — the shop's own details

   The record behind the identity card on Account: the name clients and riders
   see, the person GRIDGO talks to, and the number the rider calls. GRIDGO is
   adding `/me/supplier-profile` in parallel with this app, so a 404 is a fact
   to state rather than an error to swallow — `lib/shopProfile.ts` is the only
   caller and owns that decision.

   The write carries the version it was read at, as both `expectedVersion` in
   the body and `If-Match` in the header, or GRIDGO answers
   `400 expected_version_required`. It is sent inline here rather than through
   the board's own helper so this pair stays readable on its own.

   Email is deliberately absent from the patch type. It belongs to the GRIDGO
   sign-in, and the platform refuses it — so this app never offers it.
   -------------------------------------------------------------------------- */

export type SupplierProfile = {
  userId: string;
  shopName: string;
  contactName: string;
  /** Canonical `+639XXXXXXXXX`, or null when the shop has never given one. */
  phone: string | null;
  /** Owned by the GRIDGO sign-in. Read-only everywhere in this app. */
  email: string;
  shop: ShopLocation | null;
  pickupAvailable: boolean;
  /** Round-tripped on every write. A stale one is a 409, not a silent write. */
  version: number;
  updatedAt: string;
  /**
   * The shop's own pictures, as the platform projects them. Nothing in this
   * app reads them yet, so the shape stays unread rather than guessed.
   */
  media: unknown;
};

/**
 * What this app may change on the shop's own record.
 *
 * `email` is not here on purpose — see the note above.
 */
export type SupplierProfilePatch = {
  shopName?: string;
  contactName?: string;
  phone?: string;
};

/** Provisional. The signed-in shop's own details (the API scopes this by bearer). */
export async function getSupplierProfile(): Promise<SupplierProfile> {
  const result = await request<{ profile: SupplierProfile }>("/me/supplier-profile");
  return result.profile;
}

/**
 * Provisional. Change the shop's own details.
 *
 * `version` is the one the profile was read at. GRIDGO compares it and refuses
 * a write built on details that have since moved, so the caller has to offer
 * the latest rather than overwrite what it cannot see.
 */
export async function updateSupplierProfile(
  version: number,
  patch: SupplierProfilePatch,
): Promise<SupplierProfile> {
  const result = await request<{ profile: SupplierProfile }>("/me/supplier-profile", {
    method: "PATCH",
    headers: { "If-Match": String(version) },
    body: JSON.stringify({ ...patch, expectedVersion: version }),
  });
  return result.profile;
}

/** Format PHP minor units (centavos) for display. */
export function formatPhp(minor: number): string {
  return `₱${(minor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

