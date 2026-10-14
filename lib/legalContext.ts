/**
 * Where an agreement was made: the app and this installation.
 *
 * gridgo-api stores both beside every acceptance (`app`, `device`). They are
 * caller-reported context, not a verified identity, so the device is a random
 * ID this installation makes once and keeps — never a push token, a serial or
 * anything else the phone would want kept private.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";

import type { LegalAcceptanceContext } from "@/lib/api";

const INSTALLATION_KEY = "gridgo.supplier.installationId.v1";

/** `gridgo-supplier/1.0.150`, capped at the API's 80 characters. */
export function legalAppLabel(version = Constants.expoConfig?.version): string {
  return `gridgo-supplier/${version?.trim() || "unknown"}`.slice(0, 80);
}

function randomId(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}-${part()}-${part()}`;
}

let cached: string | null = null;

/** This installation's ID, made on first use. Storage failing never blocks consent. */
export async function installationId(): Promise<string> {
  if (cached) return cached;
  try {
    const stored = await AsyncStorage.getItem(INSTALLATION_KEY);
    if (stored) {
      cached = stored;
      return stored;
    }
    const made = `supplier-${randomId()}`;
    await AsyncStorage.setItem(INSTALLATION_KEY, made);
    cached = made;
    return made;
  } catch {
    cached = cached ?? `supplier-${randomId()}`;
    return cached;
  }
}

export async function legalContext(): Promise<LegalAcceptanceContext> {
  return { app: legalAppLabel(), device: await installationId() };
}
