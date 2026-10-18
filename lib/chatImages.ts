import { Platform } from "react-native";

import * as api from "@/lib/api";
import { ApiError } from "@/lib/apiErrors";

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

type ChatUpload = { uri: string; name: string; mimeType: string };

/** Sends one file to `POST /files`. Rejects only when it never reached GRIDGO. */
async function postChatFile(
  asset: ChatUpload,
  purpose: string,
  noun: string,
): Promise<{ status: number; data: { file?: { fileId?: unknown }; error?: unknown } | null }> {
  const token = await api.getAuthToken();
  if (!token) throw new Error(`Sign in again to send this ${noun}.`);
  const form = new FormData();
  form.append("purpose", purpose);
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
    xhr.onerror = () => reject(new Error(`That ${noun} did not reach GRIDGO. Try again.`));
    xhr.ontimeout = () => reject(new Error(`That ${noun} took too long to send. Try again.`));
    xhr.onabort = () => reject(new Error(`The ${noun} upload was cancelled. Try again.`));
    xhr.send(form);
  });
  let data: { file?: { fileId?: unknown }; error?: unknown } | null = null;
  try {
    data = JSON.parse(response.text) as typeof data;
  } catch {
    // A malformed response cannot confirm storage.
  }
  return { status: response.status, data };
}

export async function uploadChatImage(
  asset: ChatUpload,
  // Operations chat by default; the pick-up chat with a rider names its own.
  purpose: string = SUPPORT_CHAT_IMAGE_PURPOSE,
): Promise<string> {
  const { status, data } = await postChatFile(asset, purpose, "photo");
  if (status !== 201 || typeof data?.file?.fileId !== "string" || !data.file.fileId) {
    throw new Error("That photo did not reach GRIDGO. Try again.");
  }
  return data.file.fileId;
}

/**
 * A photo or a PDF for the conversation with the client. A refusal keeps
 * GRIDGO's code (`ApiError`), because "too large", "not a PDF" and "could not
 * clean this photo" each need their own sentence (`clientChatSendError`).
 */
export async function uploadChatFile(asset: ChatUpload, purpose: string): Promise<string> {
  const { status, data } = await postChatFile(asset, purpose, "file");
  if (status === 201 && typeof data?.file?.fileId === "string" && data.file.fileId) return data.file.fileId;
  if (status >= 400 && status < 500) throw new ApiError(status, data);
  throw new Error("That file did not reach GRIDGO. Try again.");
}
