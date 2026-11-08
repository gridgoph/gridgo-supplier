import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import { create } from "zustand";
import { persist } from "zustand/middleware";

import * as api from "@/lib/api";
import { getNotificationsNative } from "@/lib/expoNotifications";
import { createPersistStorage } from "@/lib/persistStorage";
import { PUSH_CHANNEL_ID } from "@/lib/push";
import {
  PLAY_FEEDBACK_URL,
  reminderPlan,
  TESTER_REMINDER_PREFIX,
  TESTER_REMINDER_TYPE,
  type HeldFeedback,
  type TesterReminder,
} from "@/lib/testerProgram";

const STORAGE_KEY = "gridgo.supplier.testerProgram.v1";

type TesterProgramStore = {
  /** The account the answer below belongs to. */
  owner: string | null;
  /** GRIDGO's last answer, or null before one (and after a failed read). */
  program: api.TesterProgramState | null;
  /** When `program` was read: the clock the feedback cooldown is judged by. */
  readAt: number;
  /** The Check in button's own call is running. */
  checkingIn: boolean;
  /** The Check in button's call failed; said on the card. */
  checkInFailed: boolean;
  /** The feedback card on screen, per account. Persisted, so a closed card stays closed. */
  held: HeldFeedback | null;
  /** Read the program; an open on a day not yet in checks it in. */
  load: (userId: string | null) => Promise<void>;
  checkIn: () => Promise<void>;
  feedbackShown: (trigger: api.TesterFeedbackTrigger, now?: number) => void;
  feedbackTapped: () => Promise<void>;
  feedbackDismissed: () => void;
  /** Another account: forget the answer. Its reminders are re-planned by the next read. */
  reset: () => void;
  /** Sign-out: forget the answer and cancel this phone's reminders. */
  forget: () => void;
};

let sequence = 0;
let buttonAttempt = 0;

/** GRIDGO's answer to a check-in from an account that is no longer a tester. */
function notEnrolled(error: unknown): boolean {
  return error instanceof api.ApiError && error.status === 404;
}

/** What the check-in records as this build: `1.0.552`, or the platform for a dev build. */
export function testerAppVersion(): string {
  const version = Constants.expoConfig?.version?.trim();
  return version ? `${version} (${Platform.OS})` : Platform.OS;
}

/**
 * The tester program for the signed-in shop. In memory, except the held
 * feedback card. Every read is silent on failure: an account that is not a
 * tester — or a GRIDGO without the routes — sees nothing at all.
 */
export const useTesterProgram = create<TesterProgramStore>()(
  persist(
    (set, get) => ({
      owner: null,
      program: null,
      readAt: 0,
      checkingIn: false,
      checkInFailed: false,
      held: null,
      load: async (userId) => {
        if (!userId) {
          get().reset();
          return;
        }
        const mine = ++sequence;
        if (get().owner !== userId) set({ owner: userId, program: null, checkingIn: false, checkInFailed: false });
        let program: api.TesterProgramState;
        try {
          program = await api.getTesterProgram();
        } catch {
          return;
        }
        if (mine !== sequence) return;
        set({ program, readAt: Date.now() });
        // Opening the app is the check-in; the button is only the way back
        // when this call could not land.
        if (program.enrolled && !program.checkedInToday && !program.stopped) {
          try {
            const checked = await api.testerCheckIn(testerAppVersion(), "open");
            if (mine !== sequence) return;
            program = checked;
            set({ program, readAt: Date.now() });
          } catch (error) {
            // A newer read or another account owns the answer now.
            if (mine !== sequence) return;
            if (notEnrolled(error)) {
              program = { enrolled: false };
              set({ program, readAt: Date.now() });
            }
            // Otherwise the card offers Check in.
          }
        }
        void syncTesterReminders(reminderPlan(program, Date.now()));
      },
      checkIn: async () => {
        if (get().checkingIn) return;
        const owner = get().owner;
        if (!owner) return;
        // The button's own attempt, apart from the program reads: a refresh
        // landing meanwhile must never strand the button in "Checking in…".
        const attempt = ++buttonAttempt;
        // The read this tap was made against. A read that starts after it is
        // newer than anything this call can answer — production approval or
        // the end of enrolment may be in it — so this answer then yields.
        const readAtTap = sequence;
        const stillMine = () => get().owner === owner && attempt === buttonAttempt;
        const overtaken = () => sequence !== readAtTap;
        set({ checkingIn: true, checkInFailed: false });
        try {
          const program = await api.testerCheckIn(testerAppVersion(), "button");
          if (!stillMine()) return;
          if (overtaken()) {
            set({ checkingIn: false });
            void get().load(owner);
            return;
          }
          set({ program, readAt: Date.now(), checkingIn: false });
          void syncTesterReminders(reminderPlan(program, Date.now()));
        } catch (error) {
          if (!stillMine()) return;
          if (overtaken()) {
            set({ checkingIn: false });
            void get().load(owner);
            return;
          }
          if (notEnrolled(error)) {
            set({ program: { enrolled: false }, readAt: Date.now(), checkingIn: false });
            void syncTesterReminders([]);
            return;
          }
          set({ checkingIn: false, checkInFailed: true });
        } finally {
          // Success, failure or GRIDGO's 20-second timeout: the button always comes back.
          if (stillMine() && get().checkingIn) set({ checkingIn: false });
        }
      },
      feedbackShown: (trigger, now = Date.now()) => {
        const owner = get().owner;
        if (!owner) return;
        set({ held: { userId: owner, trigger, shownAt: now, closed: false } });
        void api.reportTesterFeedback("shown", trigger).catch(() => undefined);
      },
      feedbackTapped: async () => {
        const held = get().held;
        if (!held) return;
        set({ held: { ...held, closed: true } });
        void api.reportTesterFeedback("tapped", held.trigger).catch(() => undefined);
        try {
          await Linking.openURL(PLAY_FEEDBACK_URL);
        } catch {
          // Nothing to open it with; the card has done what it can.
        }
      },
      feedbackDismissed: () => {
        const held = get().held;
        if (!held) return;
        set({ held: { ...held, closed: true } });
        void api.reportTesterFeedback("dismissed", held.trigger).catch(() => undefined);
      },
      reset: () => {
        sequence++;
        buttonAttempt++;
        set({ owner: null, program: null, checkingIn: false, checkInFailed: false });
      },
      forget: () => {
        get().reset();
        void syncTesterReminders([]);
      },
    }),
    {
      name: STORAGE_KEY,
      storage: createPersistStorage<Pick<TesterProgramStore, "held">>(),
      partialize: (state) => ({ held: state.held }),
    },
  ),
);

/** Bumped by every replacement, so a superseded one stops scheduling. */
let reminderGeneration = 0;
/** Replacements run one at a time: the last one asked for is what the phone keeps. */
let reminderQueue: Promise<void> = Promise.resolve();

/**
 * Replace this phone's tester reminders with `plan`. Local notifications only
 * — GRIDGO sends no tester push. Never asks for permission: without it,
 * nothing is scheduled. Web and Expo Go have no scheduler, so nothing happens.
 *
 * Replacements are serialised and the newest wins. A sign-out (an empty plan)
 * that arrives while an earlier plan is still waiting on the native module
 * runs after it and clears whatever it left, and the earlier one stops
 * scheduling the moment it is superseded.
 */
export function syncTesterReminders(plan: TesterReminder[]): Promise<void> {
  const generation = ++reminderGeneration;
  reminderQueue = reminderQueue.then(() => replaceReminders(plan, generation));
  return reminderQueue;
}

async function replaceReminders(plan: TesterReminder[], generation: number): Promise<void> {
  const current = () => generation === reminderGeneration;
  if (!current()) return;
  const Notifications = getNotificationsNative();
  if (!Notifications) return;
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
      scheduled
        .filter((entry) => entry.identifier.startsWith(TESTER_REMINDER_PREFIX))
        .map((entry) => Notifications.cancelScheduledNotificationAsync(entry.identifier)),
    );
    if (!plan.length || !current()) return;
    const permission = await Notifications.getPermissionsAsync();
    if (!permission.granted) return;
    for (const reminder of plan) {
      if (!current()) return;
      await Notifications.scheduleNotificationAsync({
        identifier: reminder.id,
        content: { title: reminder.title, body: reminder.body, data: { type: TESTER_REMINDER_TYPE } },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(reminder.at),
          channelId: PUSH_CHANNEL_ID,
        },
      });
    }
  } catch {
    // A reminder is a courtesy; failing to set one costs nothing else.
  }
}
