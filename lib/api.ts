import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * GRIDGO demo API client.
 *
 * Points at the local `gridgo-api` server. Replace this module's base URL and
 * auth storage later when Clerk / Supabase land — keep call sites stable.
 */

export type Role = "client" | "supplier" | "rider" | "ops_admin" | "super_admin";

export type User = {
  id: string;
  email: string;
  name: string;
  role: Role;
  orgName?: string;
  supplierName?: string;
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
  deadline: string | null;
  address: string;
  zone: string;
  /** Shop pin the rider collects from. Set once a supplier is assigned. */
  pickup?: { lat: number; lng: number; label: string } | null;
  totalMinor: number;
  deliveryFeeMinor: number;
  paymentMethod: string | null;
  paymentStatus: string;
  codEligible: boolean;
  promisedDate: string | null;
  artworkName: string | null;
  createdAt: string;
  updatedAt: string;
  /** Client artwork approved by QA. Read-only for this app. */
  artworkFileIds?: string[];
  /** Proofs this shop has sent the client. Newest last. */
  proofFileIds?: string[];
  deliveryPhotoFileIds?: string[];
  timeline: {
    at: string;
    state: string;
    by: string;
    note: string;
    /** Present on proof submissions. */
    fileId?: string;
  }[];
};

/** Stored file metadata. `fileId` is the only durable identity a client keeps. */
export type StoredFile = {
  fileId: string;
  purpose: "artwork" | "proof" | "delivery_photo" | "service_image";
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
  title: string;
  body: string;
  read: boolean;
  at: string;
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

/** Fields this app is allowed to change on a live service line. */
export type SupplierServicePatch = {
  capacityDaily?: number;
  capacityWeekly?: number;
  turnaroundHours?: number;
};

let tokenMemory: string | null = null;

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
 * 3. If that host is loopback and platform is Android → `http://10.0.2.2:<port>`
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
    if ((host === "localhost" || host === "127.0.0.1") && input.platformOS === "android") {
      return `http://10.0.2.2:${port}`;
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
  });
}

export function setToken(token: string | null): void {
  tokenMemory = token;
}

export function getToken(): string | null {
  return tokenMemory;
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.body && !headers["Content-Type"]) headers["Content-Type"] = "application/json";
  if (tokenMemory) headers.Authorization = `Bearer ${tokenMemory}`;

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers });
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
    if (res.status === 401) {
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

export async function logout(): Promise<void> {
  try {
    await request("/auth/logout", { method: "POST" });
  } finally {
    setToken(null);
  }
}

export async function me(): Promise<User> {
  const result = await request<{ user: User }>("/auth/me");
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

export async function listOffers(): Promise<Order[]> {
  const result = await request<{ offers: Order[] }>("/dispatch/offers");
  return result.offers;
}

export async function acceptOffer(orderId: string): Promise<Order> {
  const result = await request<{ order: Order }>(`/dispatch/${orderId}/accept`, {
    method: "POST",
    body: "{}",
  });
  return result.order;
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

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications");
  return result.notifications;
}

export async function creditBalance(): Promise<{ balanceMinor: number }> {
  return request("/credits/balance");
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
 * Bind an uploaded file to this order. For a proof this is the step that moves
 * the order into the client's review — the upload alone changes nothing.
 */
export async function attachFileToOrder(
  fileId: string,
  orderId: string,
): Promise<{ file: StoredFile; order: Order }> {
  return request(`/files/${fileId}/attach`, {
    method: "POST",
    body: JSON.stringify({ orderId }),
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

export async function requestProof(
  orderId: string,
  kind: string,
  extra: Record<string, unknown> = {},
): Promise<{ order: Order }> {
  return request(`/dispatch/${orderId}/proof`, {
    method: "POST",
    body: JSON.stringify({ kind, otp: "1234", photoName: "demo.jpg", ...extra }),
  });
}

/** Format PHP minor units (centavos) for display. */
export function formatPhp(minor: number): string {
  return `₱${(minor / 100).toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
