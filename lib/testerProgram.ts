import type { TesterFeedbackTrigger, TesterProgramState } from "@/lib/api";

/**
 * Google Play's 14-day closed test (gridgo-api `docs/TESTER_PROGRAM_API.md`).
 *
 * GRIDGO owns the count: the day, the streak and whether today is in. This
 * module only decides what an enrolled tester sees and when this phone
 * reminds them. Nothing here is drawn for an account that is not enrolled,
 * and nothing here touches a job, a price, a payout or the shop's hours.
 * Ported from gridgo-client so testers meet the same card in both apps.
 */

export const TESTER_RUN_DAYS = 14;

/**
 * Where a tester leaves feedback: the shop app's Play listing, opened as a
 * link. A closed-test tester's "private feedback to the developer" lives
 * there, not on the opt-in page. Never in-app review from a tap — Google
 * forbids a button that triggers it.
 */
export const PLAY_FEEDBACK_URL = "https://play.google.com/store/apps/details?id=ph.gridgo.supplier";

/** The server shows at most one feedback card per 72 hours; the phone holds the same line. */
export const FEEDBACK_COOLDOWN_MS = 72 * 3_600_000;

/** The tap on a reminder opens Home, where the check-in card lives. Local only: GRIDGO never sends it. */
export const TESTER_REMINDER_TYPE = "tester_reminder";

/** Every reminder this phone schedules carries this prefix, so only ours are cancelled. */
export const TESTER_REMINDER_PREFIX = "gridgo-tester-";

const DAY_MS = 86_400_000;
const MANILA_OFFSET_MS = 8 * 3_600_000;
/** 7 PM in Manila is 11:00 UTC; Manila keeps no daylight saving. */
const EVENING_UTC_HOUR = 11;
/** 8 AM in Manila is 00:00 UTC. */
const MORNING_UTC_HOUR = 0;
/**
 * How far ahead the evenings are planned: 30 rolling days, re-planned on
 * every open, so they end only after 30 days with no open at all. One-off
 * instants rather than a repeating trigger, by firstmate's decision (matching
 * gridgo-client): each keeps exact "Day N" copy and 7 PM Manila on any phone
 * clock, and an evening already checked in is never pinged — a repeating
 * trigger could do none of that. 30 evenings + 1 catch-up also stays under
 * iOS's 64 pending local notifications per app.
 */
export const PLAN_DAYS = 30;

type Enrolled = Extract<TesterProgramState, { enrolled: true }>;

/** The Manila calendar date of an instant, whatever the phone's time zone. */
export function manilaDateOf(at: number): string {
  return new Date(at + MANILA_OFFSET_MS).toISOString().slice(0, 10);
}

function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

function atUtcHour(date: string, hour: number): number {
  return Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000;
}

export type TesterCardView =
  | { kind: "check_in"; day: number; streak: number; checkedIn: boolean }
  | { kind: "complete" };

/**
 * The Home card, or null. Null for anyone not enrolled, and once the program
 * has stopped — except on the day the fourteenth check-in lands, which earns
 * one look at the full meter.
 */
export function testerCardView(state: TesterProgramState | null): TesterCardView | null {
  if (!state?.enrolled) return null;
  if (state.runComplete) return state.checkedInToday ? { kind: "complete" } : null;
  if (state.stopped) return null;
  return {
    kind: "check_in",
    day: clampDay(state.day),
    streak: Math.max(0, Math.min(TESTER_RUN_DAYS, state.streak)),
    checkedIn: state.checkedInToday,
  };
}

function clampDay(day: number): number {
  return Math.max(1, Math.min(TESTER_RUN_DAYS, Math.round(day) || 1));
}

export type MeterCell = "done" | "today" | "ahead";

/** Fourteen cells: the run so far, today's open cell when not yet in, then the days ahead. */
export function meterCells(streak: number, checkedIn: boolean): MeterCell[] {
  const done = Math.max(0, Math.min(TESTER_RUN_DAYS, streak));
  return Array.from({ length: TESTER_RUN_DAYS }, (_, index) =>
    index < done ? "done" : index === done && !checkedIn ? "today" : "ahead",
  );
}

/** "3-day streak" — or the plain start when there is no run yet. */
export function streakLabel(streak: number): string {
  if (streak <= 0) return "No streak yet";
  return `${streak}-day streak`;
}

export type TesterReminder = {
  id: string;
  /** Epoch milliseconds. An absolute instant, so the phone's time zone cannot move it. */
  at: number;
  title: string;
  body: string;
};

/**
 * The local reminders for a tester, as of GRIDGO's last answer.
 *
 * 7 PM Manila on the next day that still needs a check-in ("Day N of 14"),
 * then — because a reminder cannot know whether its day was kept — the days
 * after assume it was missed: one catch-up the next morning at 8 AM, and
 * "Day 1" each evening for the next 30 days. Every open re-plans from the
 * server, so a kept day replaces all of them. Nothing once the program stops.
 */
export function reminderPlan(state: TesterProgramState | null, now: number): TesterReminder[] {
  if (!state?.enrolled || state.stopped || state.runComplete) return [];
  const enrolled: Enrolled = state;
  if (enrolled.checkedInToday && enrolled.day >= TESTER_RUN_DAYS) return [];
  const first = enrolled.checkedInToday ? shiftDate(enrolled.manilaDate, 1) : enrolled.manilaDate;
  const firstDay = clampDay(enrolled.checkedInToday ? enrolled.day + 1 : enrolled.day);

  const plan: TesterReminder[] = [evening(first, firstDay)];
  for (let offset = 1; offset < PLAN_DAYS; offset++) {
    const date = shiftDate(first, offset);
    if (offset === 1) {
      plan.push({
        id: `${TESTER_REMINDER_PREFIX}morning-${date}`,
        at: atUtcHour(date, MORNING_UTC_HOUR),
        title: "Missed yesterday",
        body: "Open GRIDGO today to start again at Day 1.",
      });
    }
    plan.push(evening(date, 1));
  }
  return plan.filter((reminder) => reminder.at > now).sort((a, b) => a.at - b.at);
}

function evening(date: string, day: number): TesterReminder {
  return {
    id: `${TESTER_REMINDER_PREFIX}evening-${date}`,
    at: atUtcHour(date, EVENING_UTC_HOUR),
    title: `Day ${day} of ${TESTER_RUN_DAYS}`,
    body: "Open GRIDGO for 1 minute.",
  };
}

/** A feedback card this phone has put on screen, per account. */
export type HeldFeedback = {
  userId: string;
  trigger: TesterFeedbackTrigger;
  shownAt: number;
  /** Tapped or dismissed: it does not come back. */
  closed: boolean;
};

/**
 * The feedback card to draw, or null.
 *
 * GRIDGO offers a nudge only when one is due, and stops offering it the moment
 * it is shown, so the phone holds a shown card until it is tapped or dismissed.
 * One card per 72 hours on this phone too: a held card, open or closed, is
 * the only one for that long, whatever the server says.
 */
/**
 * Whether a feedback card may be drawn at all. Today must be in (the card
 * takes the check-in card's place), and production approval ends every ask —
 * including one this phone is still holding. A completed run keeps its
 * fourteenth-day ask until approval. `productionApproved` is the only signal
 * for a completed run (`stopped` is true either way); an older GRIDGO without
 * it reads as not approved.
 */
export function feedbackAllowed(state: TesterProgramState | null): boolean {
  if (!state?.enrolled) return false;
  // Approval ends every ask, a completed run's day-14 card included.
  if (state.productionApproved === true) return false;
  if (state.runComplete) return true;
  return !state.stopped && state.checkedInToday;
}

export function feedbackToShow(
  nudge: { trigger: TesterFeedbackTrigger } | null,
  held: HeldFeedback | null,
  userId: string | null,
  now: number,
): { trigger: TesterFeedbackTrigger; fresh: boolean } | null {
  if (!userId) return null;
  const mine = held && held.userId === userId ? held : null;
  if (mine && now - mine.shownAt < FEEDBACK_COOLDOWN_MS) {
    return mine.closed ? null : { trigger: mine.trigger, fresh: false };
  }
  return nudge ? { trigger: nudge.trigger, fresh: true } : null;
}
