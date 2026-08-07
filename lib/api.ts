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
  totalMinor: number;
  deliveryFeeMinor: number;
  paymentMethod: string | null;
  paymentStatus: string;
  codEligible: boolean;
  promisedDate: string | null;
  artworkName: string | null;
  createdAt: string;
  updatedAt: string;
  timeline: { at: string; state: string; by: string; note: string }[];
};

export type Notification = {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  at: string;
};

const DEFAULT_BASE = "http://127.0.0.1:8787";

let tokenMemory: string | null = null;

export function getApiBase(): string {
  return process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") || DEFAULT_BASE;
}

export function setToken(token: string | null): void {
  tokenMemory = token;
}

export function getToken(): string | null {
  return tokenMemory;
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
  if (!res.ok) throw new ApiError(res.status, data);
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

export async function listNotifications(): Promise<Notification[]> {
  const result = await request<{ notifications: Notification[] }>("/notifications");
  return result.notifications;
}

export async function creditBalance(): Promise<{ balanceMinor: number }> {
  return request("/credits/balance");
}

export async function health(): Promise<{ ok: boolean }> {
  return request("/health");
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
