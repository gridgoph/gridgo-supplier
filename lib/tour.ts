/**
 * The first-run tour: a short walk through the three things a new shop has to
 * find on its own — where a job arrives and how to take it, where accepted
 * work is scheduled, and, most of all, how to add and edit what is on its
 * board.
 *
 * Every step lights a real control on a screen that already exists, in the
 * order a shop meets them: Home → Jobs → Schedule → Catalogues → one listing's
 * editor. The tour never navigates. The last step on a screen lights the tab
 * that leads on, so the shop takes itself there with the control it will use
 * every day; a step on a later screen waits until the shop arrives, and a shop
 * that taps ahead is met by the step for the screen it reached rather than
 * dragged back to the one it skipped.
 *
 * Everything here is pure so the rules can be tested without a screen: which
 * step shows where, what Next and Back do, and when a tour starts at all. The
 * store (`store/tour.ts`) keeps one `TourProgress` per account on this phone.
 *
 * Money: a step may say "your price" and nothing else. What GRIDGO adds on top
 * is not the shop's to set and never appears here.
 */

/** A screen the tour has something to say on. */
export type TourScreen = "home" | "jobs" | "schedule" | "catalogue" | "listing";

export type TourStepId =
  | "home.jobsTab"
  | "jobs.list"
  | "jobs.scheduleTab"
  | "schedule.calendar"
  | "schedule.catalogueTab"
  | "catalogue.add"
  | "catalogue.edit"
  | "listing.price"
  | "listing.options";

export type TourStep = {
  id: TourStepId;
  screen: TourScreen;
  title: string;
  body: string;
};

export const TOUR_STEPS: readonly TourStep[] = [
  {
    id: "home.jobsTab",
    screen: "home",
    title: "New jobs arrive in Jobs",
    body: "When GRIDGO matches a job to your shop, it lands in Jobs and you get an alert. Tap Jobs.",
  },
  {
    id: "jobs.list",
    screen: "jobs",
    title: "Accept before time runs out",
    body: "Open a job to check its specs and files. Tap Accept and name your price, or Decline if you can't take it.",
  },
  {
    id: "jobs.scheduleTab",
    screen: "jobs",
    title: "Accepted jobs go on Schedule",
    body: "Tap Schedule to see what is due, and when.",
  },
  {
    id: "schedule.calendar",
    screen: "schedule",
    title: "Check your scheduled jobs",
    body: "Each accepted job sits on the day you promised it. Tap a day to see what is due.",
  },
  {
    id: "schedule.catalogueTab",
    screen: "schedule",
    title: "Now, your catalogue",
    body: "Clients order from the listings on your board. Tap Catalogues.",
  },
  {
    id: "catalogue.add",
    screen: "catalogue",
    title: "Add a listing",
    body: "Tap here to put a product on your board: its photos, your price, and the options a client picks.",
  },
  {
    id: "catalogue.edit",
    screen: "catalogue",
    title: "Edit a listing any time",
    body: "Your listings sit on this board. Tap one to change its price, options or photos, or to hide it.",
  },
  {
    id: "listing.price",
    screen: "listing",
    title: "Set your price",
    body: "Choose how you charge (per piece, per pack or by size), then type your own price.",
  },
  {
    id: "listing.options",
    screen: "listing",
    title: "Add what a client picks",
    body: "Sizes, materials, finishes: each option can add to your price. Add-ons below work the same way.",
  },
];

export const TOUR_LENGTH = TOUR_STEPS.length;

/**
 * Which tab each tab-lighting step points at. The tab bar is drawn once for
 * every tab screen, so it asks here rather than each screen wrapping it.
 */
export const TAB_TOUR_STEPS = {
  jobs: "home.jobsTab",
  schedule: "jobs.scheduleTab",
  catalogues: "schedule.catalogueTab",
} as const satisfies Partial<Record<string, TourStepId>>;

/**
 * Where one account's tour stands on this phone.
 *
 * No record at all means the tour has never been offered. `done` covers both
 * finishing and skipping — either way the shop has seen enough, and only
 * Replay brings it back.
 */
export type TourProgress = { status: "active"; step: number } | { status: "done" };

export function startTour(): TourProgress {
  return { status: "active", step: 0 };
}

/** Skip is always one tap and always final. */
export function skipTour(): TourProgress {
  return { status: "done" };
}

/**
 * The automatic start: once, for a shop with no tour on record and no job on
 * its books yet. A shop that already has work is not new and is never shown it
 * unasked; Replay under Account is how it gets it.
 */
export function shouldAutoStart(progress: TourProgress | undefined, firstTime: boolean): boolean {
  return progress === undefined && firstTime;
}

export function currentStep(progress: TourProgress | undefined): TourStep | null {
  if (!progress || progress.status !== "active") return null;
  return TOUR_STEPS[progress.step] ?? null;
}

/** The step to draw on `screen`, or null when the tour has nothing to say there. */
export function visibleStep(
  progress: TourProgress | undefined,
  screen: TourScreen | null,
): TourStep | null {
  const step = currentStep(progress);
  return step && screen && step.screen === screen ? step : null;
}

/** Past the last step is the end of the tour. */
export function nextStep(progress: TourProgress): TourProgress {
  if (progress.status !== "active") return progress;
  const step = progress.step + 1;
  return step >= TOUR_LENGTH ? { status: "done" } : { status: "active", step };
}

/**
 * The shop used the lit control itself — the "+" that opens a new listing —
 * and went somewhere the tour does not follow. Move past that step, so coming
 * back does not ask it to do what it has just done. Any other step: unchanged.
 */
export function completeStep(progress: TourProgress, id: TourStepId): TourProgress {
  return currentStep(progress)?.id === id ? nextStep(progress) : progress;
}

/**
 * Back only moves within the screen the shop is on. The step before this
 * screen's first lives on the screen it came from, and the tour does not
 * navigate — the system back does that.
 */
export function canGoBack(progress: TourProgress): boolean {
  if (progress.status !== "active" || progress.step === 0) return false;
  return TOUR_STEPS[progress.step - 1]?.screen === TOUR_STEPS[progress.step]?.screen;
}

export function backStep(progress: TourProgress): TourProgress {
  if (progress.status !== "active" || !canGoBack(progress)) return progress;
  return { status: "active", step: progress.step - 1 };
}

/**
 * The shop reached `screen`. If its first step is ahead of where the tour
 * stands — it tapped the lit tab, or went its own way — the tour moves up to
 * meet it. A screen whose steps are already behind the tour stays quiet: going
 * back to Home mid-tour does not start it over.
 */
export function arriveAt(progress: TourProgress, screen: TourScreen): TourProgress {
  if (progress.status !== "active") return progress;
  const first = TOUR_STEPS.findIndex((step) => step.screen === screen);
  if (first > progress.step) return { status: "active", step: first };
  return progress;
}

/**
 * The Next button says what it will do. "Next" stays on this screen; "Got it"
 * puts the card away until the shop reaches the next screen; "Done" ends it.
 */
export function nextLabel(progress: TourProgress): "Next" | "Got it" | "Done" {
  if (progress.status !== "active" || progress.step >= TOUR_LENGTH - 1) return "Done";
  const here = TOUR_STEPS[progress.step];
  const after = TOUR_STEPS[progress.step + 1];
  return here && after && here.screen === after.screen ? "Next" : "Got it";
}

/** Read aloud and drawn as dots: which step of how many. */
export function stepPosition(progress: TourProgress): { index: number; count: number } {
  return {
    index: progress.status === "active" ? progress.step : TOUR_LENGTH - 1,
    count: TOUR_LENGTH,
  };
}

export type TourRect = { x: number; y: number; width: number; height: number };

/**
 * Where the instruction card goes: under the lit control when it fits there,
 * over it when it fits there instead, and pinned to the bottom edge when the
 * control fills the screen. Coordinates are window pixels.
 */
export function placeCard({
  target,
  cardHeight,
  windowHeight,
  insetTop,
  insetBottom,
  gap = 16,
}: {
  target: TourRect | null;
  cardHeight: number;
  windowHeight: number;
  insetTop: number;
  insetBottom: number;
  gap?: number;
}): { top: number; side: "below" | "above" | "pinned" } {
  const floor = windowHeight - insetBottom - gap;
  const pinned = { top: Math.max(insetTop + gap, floor - cardHeight), side: "pinned" as const };
  if (!target) return pinned;

  const below = target.y + target.height + gap;
  if (below + cardHeight <= floor) return { top: below, side: "below" };

  const above = target.y - gap - cardHeight;
  if (above >= insetTop + gap) return { top: above, side: "above" };

  return pinned;
}

/**
 * A control taller than the room left beside the card — a long job list, the
 * month calendar — gets a card pinned over its lower edge. The light then
 * stops above the card rather than running on underneath it, so the cut-out
 * never looks sliced. Too little left above the card to be worth lighting:
 * unchanged.
 */
export function fitHoleAbove(hole: TourRect, cardTop: number, gap = 12, minimum = 48): TourRect {
  const bottom = cardTop - gap;
  if (hole.y + hole.height <= bottom) return hole;
  const height = bottom - hole.y;
  return height >= minimum ? { ...hole, height } : hole;
}
