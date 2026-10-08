import { Platform } from "react-native";

import * as api from "@/lib/api";

export const SUPPORT_CHAT_IMAGE_PURPOSE = "support_chat_image" as const;
export const SUPPORT_CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const SUPPORT_CHAT_IMAGE_MAX_COUNT = 4;

export function validateChatImageAsset(asset: {
  name?: string | null;
  mimeType?: string | null;
  size?: number | null;
}): string | null {
  const type = asset.mimeType === "image/jpg" ? "image/jpeg" : (asset.mimeType || "");
  const name = String(asset.name || "").toLowerCase();
  const extensionOk = [".jpg", ".jpeg", ".png", ".webp"].some((ext) => name.endsWith(ext));
  const typeOk = ["image/jpeg", "image/png", "image/webp"].includes(type);
  if (!typeOk && !extensionOk) return "Choose a JPEG, PNG, or WebP photo.";
  if (asset.size === 0) return "That file is empty.";
  if (typeof asset.size === "number" && asset.size > SUPPORT_CHAT_IMAGE_MAX_BYTES) {
    return "Photos can be up to 15 MB.";
  }
  return null;
}

export async function pickChatImages(): Promise<Array<{
  uri: string;
  name: string;
  mimeType: string;
  size: number | null;
}>> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ImagePicker = require("expo-image-picker") as {
    launchImageLibraryAsync: (options: Record<string, unknown>) => Promise<{
      canceled: boolean;
      assets?: Array<{ uri: string; fileName?: string | null; mimeType?: string | null; fileSize?: number | null }>;
    }>;
  };
  const picked = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images"],
    allowsMultipleSelection: true,
    quality: 0.9,
  });
  if (picked.canceled || !picked.assets?.length) return [];
  return picked.assets.map((asset, index) => ({
    uri: asset.uri,
    name: asset.fileName || `photo-${index + 1}.jpg`,
    mimeType: asset.mimeType || "image/jpeg",
    size: asset.fileSize ?? null,
  }));
}

export async function uploadChatImage(asset: {
  uri: string;
  name: string;
  mimeType: string;
}): Promise<string> {
  const token = await api.getAuthToken();
  if (!token) throw new Error("Sign in again to send this photo.");
  const form = new FormData();
  form.append("purpose", SUPPORT_CHAT_IMAGE_PURPOSE);
  if (Platform.OS === "web") {
    const photo = await fetch(asset.uri);
    form.append("file", await photo.blob(), asset.name);
  } else {
    form.append("file", {
      uri: asset.uri,
      name: asset.name,
      type: asset.mimeType,
    } as unknown as Blob);
  }
  // Expo 57's fetch rejects React Native's URI form parts; XHR streams them.
  const response = await new Promise<{ status: number; text: string }>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${api.getApiBase()}/files`);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("X-GRIDGO-Role", "supplier");
    xhr.onload = () => resolve({ status: xhr.status, text: xhr.responseText });
    xhr.onerror = () => reject(new Error("That photo did not reach GRIDGO. Try again."));
    xhr.ontimeout = () => reject(new Error("That photo took too long to send. Try again."));
    xhr.onabort = () => reject(new Error("The photo upload was cancelled. Try again."));
    xhr.send(form);
  });
  let data: { file?: { fileId?: unknown } } | null = null;
  try {
    data = JSON.parse(response.text) as { file?: { fileId?: unknown } } | null;
  } catch {
    // A malformed response cannot confirm storage.
  }
  if (response.status !== 201 || typeof data?.file?.fileId !== "string" || !data.file.fileId) {
    throw new Error("That photo did not reach GRIDGO. Try again.");
  }
  return data.file.fileId;
}
