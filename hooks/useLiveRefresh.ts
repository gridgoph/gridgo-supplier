import { AppState } from "react-native";
import { useCallback, useRef } from "react";
import { useFocusEffect } from "expo-router";
import { liveGeneration, subscribeLive, type LiveResource } from "@/lib/live";

/** Focus owns the subscription; callback changes cannot cancel queued work. */
export function useLiveRefresh(resources: readonly LiveResource[], refresh: () => void | Promise<unknown>): void {
  const latest = useRef(refresh);
  latest.current = refresh;
  const key = resources.join(",");
  const ownerGeneration = liveGeneration();
  useFocusEffect(useCallback(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let running = false;
    let dirty = false;
    const generation = ownerGeneration;
    const flush = async () => {
      timer = null;
      if (!active || generation !== liveGeneration() || AppState.currentState === "background" || AppState.currentState === "inactive") return;
      if (running) { dirty = true; return; }
      running = true;
      try { await latest.current(); } catch { /* Screen owns its error. */ }
      finally {
        running = false;
        if (dirty && active) { dirty = false; timer = setTimeout(() => void flush(), 80); }
      }
    };
    const unsubscribe = subscribeLive((resource) => {
      if (resource !== "*" && !key.split(",").includes(resource)) return;
      if (!timer) timer = setTimeout(() => void flush(), 80);
    });
    return () => { active = false; unsubscribe(); if (timer) clearTimeout(timer); };
  }, [key, ownerGeneration]));
}
