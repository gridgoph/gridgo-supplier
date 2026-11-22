/**
 * The shop's team as GRIDGO describes it (gridgo-api `docs/SHOP_TEAM_API.md`,
 * "Extended team contract", report F315793B): people with their own login,
 * phone-free people who pick themselves on the shop's phone with a PIN, the
 * week's positive team view, and the Owner's two team settings.
 *
 * The only place `GET /me/shop-team`'s raw shape is read. Every field is read
 * defensively, and a response without `pinStaff` is an older GRIDGO: the
 * roster still draws, and nothing about PINs, the picker, speed or the mission
 * is offered (`hasPinStaff`).
 *
 * Positive only, by design: there is no slowest list, and a member's speed is
 * GRIDGO's to withhold — Staff never receive `stats.members`, and the ranking
 * badge disappears when the Owner hides it. Nothing here re-derives either.
 */

import { apiErrorCode, humanizeApiError, offlineMessage } from "@/lib/apiErrors";
import {
  readShopRole,
  type ShopMemberStatus,
  type ShopRole,
  type TeamInvite,
  type TeamMember,
} from "@/lib/shopTeam";

export type JobsHandledBy = "just_me" | "me_and_staff";

export type TeamSettings = {
  jobsHandledBy: JobsHandledBy;
  /** Owner's switch. Off removes the fastest badge from Staff's view; the mission stays. */
  showRankingToStaff: boolean;
};

/** One person on the team, whichever way they work. */
export type TeamPerson = {
  /** `userId` for a login, `pinStaffId` for a PIN person. Unique across both. */
  key: string;
  kind: "account" | "pin";
  name: string;
  role: ShopRole;
  status: ShopMemberStatus;
  jobAlerts: boolean;
  photoFileId: string | null;
  /** PIN people only: picked on the shop's phone right now. */
  onShift: boolean;
  createdAt: string | null;
};

export type PersonSpeed = {
  key: string;
  name: string;
  jobsThisWeek: number;
  acceptedJobs: number;
  /** Null until GRIDGO has measured an accept for them this week. */
  averageAcceptSeconds: number | null;
};

export type TeamMission = {
  targetJobs: number;
  quickAcceptedJobs: number;
  acceptedJobs: number;
  completed: boolean;
};

export type TeamStats = {
  /** Who accepts fastest this week. Null when nobody is measured yet, or hidden from Staff. */
  fastest: { key: string; name: string } | null;
  mission: TeamMission | null;
  /** Owners and Managers only. Null for Staff, who never receive it. */
  members: PersonSpeed[] | null;
};

export type ShopTeam = {
  shopName: string | null;
  /** Logins as GRIDGO sent them, for the callers that still read the base contract. */
  members: TeamMember[];
  invites: TeamInvite[];
  people: TeamPerson[];
  stats: TeamStats | null;
  settings: TeamSettings | null;
  /** GRIDGO offers phone-free PIN staff, the picker and the weekly view. */
  hasPinStaff: boolean;
};

type Row = Record<string, unknown>;

const isRow = (value: unknown): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);
const count = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0);

function readStatus(value: unknown): ShopMemberStatus {
  return value === "active" || value === "removed" ? value : "pending";
}

function readPerson(row: Row, kind: "account" | "pin"): TeamPerson | null {
  const key = kind === "account" ? text(row.userId) : (text(row.pinStaffId) ?? text(row.id));
  if (!key) return null;
  return {
    key,
    kind,
    name: text(row.name) ?? (kind === "pin" ? "Staff" : "Team member"),
    role: readShopRole(row.role),
    status: kind === "pin" && row.status === undefined ? "active" : readStatus(row.status),
    jobAlerts: row.jobAlerts !== false,
    photoFileId: text(row.photoFileId),
    onShift: kind === "pin" && row.onShift === true,
    createdAt: text(row.createdAt),
  };
}

function readStats(value: unknown): TeamStats | null {
  if (!isRow(value)) return null;
  const fastestRow = isRow(value.fastestThisWeek) ? value.fastestThisWeek : null;
  const fastestKey = fastestRow ? (text(fastestRow.pinStaffId) ?? text(fastestRow.userId)) : null;
  const missionRow = isRow(value.mission) ? value.mission : null;
  const target = missionRow ? count(missionRow.targetJobs) : 0;
  return {
    fastest: fastestRow && fastestKey ? { key: fastestKey, name: text(fastestRow.name) ?? "A teammate" } : null,
    mission:
      missionRow && target > 0
        ? {
            targetJobs: target,
            quickAcceptedJobs: count(missionRow.quickAcceptedJobs),
            acceptedJobs: count(missionRow.acceptedJobs),
            completed: missionRow.completed === true || count(missionRow.quickAcceptedJobs) >= target,
          }
        : null,
    members: Array.isArray(value.members)
      ? value.members.filter(isRow).flatMap((row) => {
          const key = text(row.pinStaffId) ?? text(row.userId);
          if (!key) return [];
          const average = row.averageAcceptSeconds;
          return [
            {
              key,
              name: text(row.name) ?? "Team member",
              jobsThisWeek: count(row.jobsThisWeek),
              acceptedJobs: count(row.acceptedJobs),
              averageAcceptSeconds: typeof average === "number" && Number.isFinite(average) && average >= 0 ? average : null,
            },
          ];
        })
      : null,
  };
}

export function readTeamSettings(value: unknown): TeamSettings | null {
  if (!isRow(value)) return null;
  return {
    jobsHandledBy: value.jobsHandledBy === "me_and_staff" ? "me_and_staff" : "just_me",
    showRankingToStaff: value.showRankingToStaff !== false,
  };
}

/** `GET /me/shop-team`, older or newer. */
export function readShopTeam(value: unknown): ShopTeam {
  const body = isRow(value) ? value : {};
  const accounts = Array.isArray(body.members) ? body.members.filter(isRow) : [];
  const pins = Array.isArray(body.pinStaff) ? body.pinStaff.filter(isRow) : null;
  return {
    shopName: isRow(body.shop) ? text(body.shop.name) : null,
    members: accounts as unknown as TeamMember[],
    invites: Array.isArray(body.invites) ? (body.invites.filter(isRow) as unknown as TeamInvite[]) : [],
    people: [
      ...accounts.map((row) => readPerson(row, "account")),
      ...(pins ?? []).map((row) => readPerson(row, "pin")),
    ].filter((person): person is TeamPerson => person != null),
    stats: readStats(body.stats),
    settings: readTeamSettings(body.settings),
    hasPinStaff: pins != null,
  };
}

/** A PIN person from `GET /me/shop-team/working` or a PIN route's `{member}`. */
export function readPinPerson(value: unknown): TeamPerson | null {
  return isRow(value) ? readPerson(value, "pin") : null;
}

/* --------------------------------------------------------------------------
   Reading order
   -------------------------------------------------------------------------- */

const ROLE_ORDER: Record<ShopRole, number> = { owner: 0, manager: 1, staff: 2 };

export type TeamLayout = {
  /** Owners and Managers: the shop card. */
  leads: TeamPerson[];
  /** Everyone else who works, with or without a phone. */
  staff: TeamPerson[];
  /** Joined with a link or QR; waiting on an Owner or Manager. */
  waiting: TeamPerson[];
  onShift: number;
};

export function teamLayout(people: readonly TeamPerson[]): TeamLayout {
  const byName = (a: TeamPerson, b: TeamPerson) => a.name.localeCompare(b.name);
  const active = people.filter((person) => person.status === "active");
  return {
    leads: active
      .filter((person) => person.role !== "staff")
      .sort((a, b) => ROLE_ORDER[a.role] - ROLE_ORDER[b.role] || byName(a, b)),
    staff: active.filter((person) => person.role === "staff").sort(byName),
    waiting: people.filter((person) => person.status === "pending" && person.kind === "account").sort(byName),
    onShift: active.filter((person) => person.onShift).length,
  };
}

/** Under a face on the grid: how this person works today. */
export function personLine(person: TeamPerson): string {
  if (person.status === "pending") return "Waiting for you";
  if (person.kind === "pin") return person.onShift ? "On shift · PIN" : "PIN";
  return "Own phone";
}

/* --------------------------------------------------------------------------
   Who may change whom
   -------------------------------------------------------------------------- */

/** Owners and Managers run the team; Staff see the positive view only. */
export function canManageTeam(role: ShopRole | null | undefined): boolean {
  return role === "owner" || role === "manager";
}

/**
 * Whether the viewer may change this person: role, alerts, photo, PIN,
 * removal. An Owner manages everyone but themselves and other Owners (the
 * last-owner rule and Owner changes stay on the web); a Manager manages Staff
 * only, never themselves.
 */
export function canManagePerson(viewer: ShopRole | null | undefined, person: TeamPerson, selfKey: string | null): boolean {
  if (person.key === selfKey || person.status === "removed" || person.role === "owner") return false;
  if (viewer === "owner") return true;
  return viewer === "manager" && person.role === "staff";
}

/** Only an Owner makes someone a Manager. */
export function canChangeRole(viewer: ShopRole | null | undefined, person: TeamPerson): boolean {
  return viewer === "owner" && person.role !== "owner" && person.status === "active";
}

/* --------------------------------------------------------------------------
   Words
   -------------------------------------------------------------------------- */

/** "38 sec", "4 min", "1 hr 5 min". Never "0 sec": under a second is "1 sec". */
export function acceptSpeedLabel(seconds: number | null | undefined): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const whole = Math.max(1, Math.round(seconds));
  if (whole < 60) return `${whole} sec`;
  const minutes = Math.round(whole / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/** The weekly goal, said plainly. GRIDGO counts accepts within five minutes. */
export function missionTitle(mission: TeamMission): string {
  return `Team mission: accept ${mission.targetJobs} jobs within 5 minutes this week`;
}

export function missionProgress(mission: TeamMission): { done: number; target: number; fraction: number } {
  const done = Math.min(mission.quickAcceptedJobs, mission.targetJobs);
  return { done, target: mission.targetJobs, fraction: mission.targetJobs ? done / mission.targetJobs : 0 };
}

/** A PIN is exactly four digits, kept as a string so 0420 stays 0420. */
export function isPin(value: string): boolean {
  return /^\d{4}$/.test(value);
}

export function pinNameProblem(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return "Add their name.";
  if (trimmed.length > 100) return "Use a shorter name.";
  return null;
}

/** The face on a card: first letter, never empty. */
export function initialOf(name: string): string {
  return name.trim().charAt(0).toUpperCase() || "?";
}

/** A refused PIN form, in words. */
export function pinFormProblem(error: unknown): string {
  switch (apiErrorCode(error)) {
    case "invalid_shop_pin":
      return "A PIN is exactly 4 numbers.";
    case "invalid_shop_member_name":
    case "invalid_shop_member_update":
      return "Check their name. Use up to 100 letters.";
    case "invalid_shop_team_photo":
      return "That photo could not be used. Pick another, or leave it out.";
    case "shop_owner_required":
      return "Only the owner can add a manager.";
    default:
      return humanizeApiError(error, offlineMessage("save this person"));
  }
}
