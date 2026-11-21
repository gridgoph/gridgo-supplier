import { useRef, useState } from "react";
import { router } from "expo-router";

import * as api from "@/lib/api";
import { apiErrorCode, humanizeApiError, isProductionPhotoRequired, offlineMessage, stepRefusal } from "@/lib/apiErrors";
import { primaryAction, routeForAction } from "@/lib/jobState";
import { hasSpecialInstructions } from "@/lib/orderChanges";
import { EXPRESS_STEP_NOTE, expressReadyPhotoStep, expressReadySteps } from "@/lib/todo";

/**
 * The two taps an Express card takes on its own: Accept, and It's ready.
 *
 * Neither is shown as done before GRIDGO says so. Whatever GRIDGO wants first
 * — notes read, a photo, its own check — opens the screen that asks for it
 * rather than a red line on the card.
 */
export function useExpressCard(job: api.Order, reload: () => Promise<unknown>) {
  const [busy, setBusy] = useState<"accept" | "ready" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const pending = useRef(false);

  async function accept() {
    if (pending.current) return;
    // GRIDGO refuses an acceptance on a job with notes until they are read.
    if (hasSpecialInstructions(job)) {
      router.push({ pathname: "/job/[id]/accept", params: { id: job.id } });
      return;
    }
    pending.current = true;
    setBusy("accept");
    setError(null);
    try {
      await api.acceptExpress(job.id, false);
    } catch (e) {
      if (apiErrorCode(e) === "shop_acceptance_expired") setExpired(true);
      else setError(humanizeApiError(e, offlineMessage("accept this job")));
    } finally {
      pending.current = false;
      setBusy(null);
      void reload();
    }
  }

  /** Put it on the press if it is not yet, then mark it ready — one tap. True once GRIDGO has it as ready. */
  async function ready(): Promise<boolean> {
    if (pending.current) return false;
    const steps = expressReadySteps(job);
    if (!steps.length) {
      const photo = expressReadyPhotoStep(job);
      if (photo) router.push({ pathname: routeForAction(photo), params: { id: job.id, action: photo } });
      else openNextStep(job);
      return false;
    }
    pending.current = true;
    setBusy("ready");
    setError(null);
    let current = job;
    try {
      for (const state of steps) {
        current = await api.transitionOrder(job.id, state, { note: EXPRESS_STEP_NOTE[state] ?? state });
      }
      return true;
    } catch (e) {
      const photoStep = isProductionPhotoRequired(e) ? "/job/[id]/progress-photo" : PHOTO_STEP_FOR[apiErrorCode(e)];
      if (photoStep) {
        // GRIDGO keeps its photo gates on Express too: open the step it asked for.
        router.push({ pathname: photoStep, params: { id: job.id } });
      } else {
        setError(stepRefusal(e)?.message ?? humanizeApiError(e, offlineMessage("mark this job ready")));
        // The first step may have gone through. If It's ready can still be
        // sent, the card keeps it for another tap; otherwise the job says what is left.
        if (current !== job && !expressReadySteps(current).length) openNextStep(current);
      }
      return false;
    } finally {
      pending.current = false;
      setBusy(null);
      void reload();
    }
  }

  return { accept, ready, busy, error, expired, clearError: () => setError(null) };
}

/** GRIDGO's refusals that name a photo step this app already has a screen for. */
const PHOTO_STEP_FOR: Record<string, "/job/[id]/finished" | "/job/[id]/progress-photo" | undefined> = {
  production_finished_required: "/job/[id]/finished",
  finished_product_photo_required: "/job/[id]/finished",
  production_photo_required: "/job/[id]/progress-photo",
};

/** The job's own next step, on the screen that runs it. */
function openNextStep(job: api.Order) {
  const action = primaryAction(job);
  if (!action) {
    router.push({ pathname: "/job/[id]", params: { id: job.id } });
    return;
  }
  router.push({ pathname: routeForAction(action.kind), params: { id: job.id, action: action.kind } });
}
