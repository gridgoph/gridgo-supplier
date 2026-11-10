/**
 * A shop's team: an Owner with full access, and Staff who receive and process
 * orders (gridgo-api `docs/SHOP_TEAM_API.md`, issue gridgo-api#359).
 *
 * The only place a membership role or status, an invite, or an action's actor
 * becomes words. GRIDGO enforces every limit on the server; hiding a screen
 * here is presentation, never access.
 */

export type ShopRole = "owner" | "staff";
export type ShopMemberStatus = "pending" | "active" | "removed";
export type InviteKind = "email" | "phone" | "qr" | "link";
export type InviteStatus = "open" | "claimed" | "revoked" | "expired";

export type ShopSummary = {
  id: string;
  name: string;
  role: ShopRole;
  status: ShopMemberStatus;
};

export type TeamMember = {
  userId: string;
  name: string;
  role: ShopRole;
  status: ShopMemberStatus;
  createdAt: string;
  updatedAt: string;
};

export type TeamInvite = {
  id: string;
  shopId: string;
  kind: InviteKind;
  identity: string | null;
  createdAt: string;
  expiresAt: string;
  claimedBy?: string | null;
  status: InviteStatus;
  /** Present on a discovered email/phone invite. */
  shop?: { id: string; name: string };
};

export type CreatedInvite = { invite: TeamInvite; token: string };

export type ActionActor = {
  userId?: string | null;
  name?: string | null;
  role?: string | null;
};

export type OrderAction = {
  id: string;
  at: string;
  action: string;
  actor?: ActionActor | null;
};

/** Where a join link opens. The website serves the same path for the web. */
export const JOIN_TEAM_URL = "https://gridgo-dash.talasora.com/join-team";

/** The link an Owner shares, and what its QR encodes. The token rides in the fragment. */
export function joinTeamLink(token: string): string {
  return `${JOIN_TEAM_URL}#token=${encodeURIComponent(token)}`;
}

/**
 * The invite token in anything a person pastes or a camera reads: a full join
 * link, the app's own scheme, `token=…` alone, or the bare token. Null when
 * there is nothing that could be one.
 */
export function tokenFromLink(text: string | null | undefined): string | null {
  const value = (text ?? "").trim();
  if (!value) return null;
  const match = /[#?&]token=([^&#\s]+)/.exec(value) ?? /^token=([^&#\s]+)$/.exec(value);
  const raw = match ? match[1] : /^[A-Za-z0-9_-]{32,64}$/.test(value) ? value : null;
  if (!raw) return null;
  try {
    const decoded = decodeURIComponent(raw);
    return /^[A-Za-z0-9_-]{16,128}$/.test(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

/** Hours (or minutes, in the last hour) an invite has left; null once expired. */
export function inviteTimeLeft(expiresAt: string, now: number = Date.now()): string | null {
  const end = Date.parse(expiresAt);
  if (!Number.isFinite(end)) return null;
  const minutes = Math.floor((end - now) / 60_000);
  if (minutes <= 0) return null;
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h`;
}

/** An open invite that can still be used. A past `expiresAt` counts as expired. */
export function isLiveInvite(invite: TeamInvite, now: number = Date.now()): boolean {
  return invite.status === "open" && inviteTimeLeft(invite.expiresAt, now) != null;
}

export const ROLE_LABEL: Record<ShopRole, string> = { owner: "Owner", staff: "Staff" };

export function roleLabel(role: unknown): string {
  return role === "owner" || role === "staff" ? ROLE_LABEL[role] : "Staff";
}

/** What an invite was sent to, in a line. QR and link invites have no address. */
export function inviteTarget(invite: Pick<TeamInvite, "kind" | "identity">): string {
  if ((invite.kind === "email" || invite.kind === "phone") && invite.identity) return invite.identity;
  return invite.kind === "qr" ? "QR code" : "Share link";
}

/** The team in reading order: people waiting on the owner, then owners, then staff. */
export function teamSections(members: TeamMember[]): {
  pending: TeamMember[];
  active: TeamMember[];
} {
  const byName = (a: TeamMember, b: TeamMember) => a.name.localeCompare(b.name);
  return {
    pending: members.filter((m) => m.status === "pending").sort(byName),
    active: members
      .filter((m) => m.status === "active")
      .sort((a, b) => (a.role === b.role ? byName(a, b) : a.role === "owner" ? -1 : 1)),
  };
}

/** How many people wait on the owner's answer. */
export function pendingCount(members: TeamMember[] | null | undefined): number {
  return (members ?? []).filter((m) => m.status === "pending").length;
}

/**
 * Who did something on an order, in the shop's words. A shop member is named
 * with their role; anyone else by the part they play.
 */
export function actorLabel(actor: ActionActor | null | undefined): string | null {
  if (!actor) return null;
  const name = actor.name?.trim();
  switch (actor.role) {
    case "owner":
    case "staff":
      return name ? `${name} (${ROLE_LABEL[actor.role]})` : ROLE_LABEL[actor.role];
    case "system":
      return "GRIDGO";
    case "client":
      return "Client";
    case "rider":
      return name ? `${name} (Rider)` : "Rider";
    case "ops_admin":
    case "super_admin":
      return "Operations";
    case "supplier":
      return name || "Your shop";
    default:
      return name || null;
  }
}

/**
 * Who did a timeline entry. An entry's own actor is authoritative, and a
 * `by: "system"` step is always GRIDGO. An older entry is enriched from the
 * order's actions only when one recorded at the same moment (to the second)
 * names the same person as the entry's `by` — time alone never names anyone,
 * because GRIDGO writes a system notice at the same instant as a person's
 * step. No match, or more than one person, leaves the older label in place.
 */
export function actorForEntry(
  entry: { at: string; by?: unknown; actor?: ActionActor | null },
  actions: OrderAction[] | null | undefined,
): ActionActor | null {
  if (entry.actor) return entry.actor;
  if (entry.by === "system") return { role: "system" };
  const by = typeof entry.by === "string" ? entry.by.trim() : "";
  const at = Date.parse(entry.at);
  if (!by || !Number.isFinite(at) || !actions?.length) return null;
  const matches = actions.filter((action) => {
    const when = Date.parse(action.at);
    return Number.isFinite(when) && Math.abs(when - at) < 1000 && action.actor?.userId === by;
  });
  const roles = new Set(matches.map((action) => action.actor?.role ?? ""));
  return matches.length && roles.size === 1 ? (matches[matches.length - 1].actor ?? null) : null;
}

/**
 * What a recorded action did, in the shop's words. The same vocabulary as the
 * website's "Who did what", spoken about a job. An unknown code reads as an
 * update — never raw — so a new kind of action GRIDGO starts recording still
 * shows up, just plainly.
 */
const ACTION_LABEL: Record<string, string> = {
  "order.created": "Placed the order",
  "order.transition": "Moved the job on",
  "order.updated": "Updated the job",
  "order.special_instructions_acknowledged": "Read the special instructions",
  "order.arrived_packed": "Marked it packed",
  "order.rider_packing_photo": "Added a packing photo",
  "order.rider_assigned": "Assigned a rider",
  "order.file_check": "Checked the files",
  "order.production_override": "Moved it to ready",
  "order.supplier_assigned": "Assigned your shop",
  "order.supplier_changed": "Changed the shop",
  "order.artwork_download": "Downloaded the artwork",
  "order.artwork_download_all": "Downloaded all artwork",
  "order.qa_tick": "Ticked a quality check",
  "order.qa_request_file": "Asked for a new file",
  "order.confirm_delivery": "Confirmed delivery",
  "order.rated": "Rated the job",
  "order.physical_invoice_requested": "Asked for a paper invoice",
  "order.physical_invoice_promised": "Promised the paper invoice",
  "order.delivery_pin_requested": "Asked for the delivery PIN",
  "order.approval_recorded": "Recorded an approval",
  "order.transition_refused": "Tried a step that was refused",
  "dispatch.milestone": "Updated the delivery",
  "file.saved": "Added a file",
  "client_shop_chat.message_sent": "Messaged the client",
  "pickup_chat.message_sent": "Messaged the rider",
  "pickup_checklist.inspected": "Checked the order at the counter",
  "pickup_checklist.handoff_signed": "Signed the handover",
  "pickup_checklist.escalate": "Raised a pickup problem",
  "pickup_escalation.resolve": "Resolved a pickup problem",
  "handover.escalated": "Raised a handover problem",
  "claim.raise": "Opened a claim",
  "claim.hold": "Held payouts for a claim",
  "claim.release": "Released a claim hold",
  "order.remove": "Removed the order",
};

export function actionLabel(action: unknown): string {
  const code = typeof action === "string" ? action : "";
  if (ACTION_LABEL[code]) return ACTION_LABEL[code];
  if (code.startsWith("order.change")) return "Handled a change request";
  if (code.startsWith("order.reschedule")) return "Handled a deadline request";
  if (code.startsWith("order.shop_")) return "Changed the shop's part";
  if (code.startsWith("order.delivery_pin")) return "Handled the delivery PIN";
  if (code.startsWith("payment.")) return "Updated the payment";
  if (code.startsWith("refund.")) return "Updated a refund";
  if (code.startsWith("file.")) return "Updated a file";
  return "Updated the job";
}

export type OrderActionRow = {
  id: string;
  /** "Messaged the client", or "Moved it to Packaging" when the step is known. */
  what: string;
  /** "Ana (Staff)"; null when GRIDGO recorded nobody, which names nobody. */
  who: string | null;
  at: string;
};

/**
 * Every recorded action on a job, newest first — the chat message and the
 * photo as well as the steps. A step names the state it reached when a
 * timeline entry from the same person at the same second says which.
 */
export function orderActionRows(
  actions: unknown,
  timeline: readonly { at: string; state: string; by?: unknown; actor?: ActionActor | null }[] = [],
  stateLabel: (state: string) => string = (state) => state,
): OrderActionRow[] {
  return readOrderActions(actions)
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const diff = (Date.parse(b.row.at) || 0) - (Date.parse(a.row.at) || 0);
      return diff || b.index - a.index;
    })
    .map(({ row, index }) => {
      let what = actionLabel(row.action);
      if (row.action === "order.transition") {
        const reached = stepReached(row, timeline);
        if (reached) what = `Moved it to ${stateLabel(reached)}`;
      }
      return { id: typeof row.id === "string" && row.id ? row.id : `${row.at}-${index}`, what, who: actorLabel(row.actor), at: row.at };
    });
}

function stepReached(
  row: OrderAction,
  timeline: readonly { at: string; state: string; by?: unknown; actor?: ActionActor | null }[],
): string | null {
  const at = Date.parse(row.at);
  const userId = row.actor?.userId;
  if (!Number.isFinite(at) || !userId) return null;
  const matches = timeline.filter((entry) => {
    const when = Date.parse(entry.at);
    const who = entry.actor?.userId ?? (typeof entry.by === "string" ? entry.by : null);
    return Number.isFinite(when) && Math.abs(when - at) < 1000 && who === userId;
  });
  const states = new Set(matches.map((entry) => entry.state));
  return states.size === 1 ? matches[0].state : null;
}

/** Defensive read of an order's `actions` (absent on an older API). */
export function readOrderActions(value: unknown): OrderAction[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (row): row is OrderAction =>
      Boolean(row) && typeof row === "object" && typeof (row as OrderAction).at === "string",
  );
}

/** Lower-cased email, or an E.164 phone from a Philippine local number. */
export function normalizeInviteIdentity(kind: "email" | "phone", value: string): string | null {
  const trimmed = value.trim();
  if (kind === "email") {
    const email = trimmed.toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
  }
  const digits = trimmed.replace(/[^\d+]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(digits)) return digits;
  if (/^09\d{9}$/.test(digits)) return `+63${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+63${digits}`;
  if (/^639\d{9}$/.test(digits)) return `+${digits}`;
  return null;
}
