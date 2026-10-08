import { Platform } from "react-native";

import * as api from "@/lib/api";
import { uploadChatImage } from "@/lib/chatImages";

const photo = { uri: "file:///cache/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg" };

class UploadRequest {
  static requests: UploadRequest[] = [];
  status = 201;
  responseText = JSON.stringify({ file: { fileId: "file_chat_photo" } });
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  onabort: (() => void) | null = null;
  open = jest.fn();
  setRequestHeader = jest.fn();
  send = jest.fn<void, [FormData]>(() => { this.onload?.(); });

  constructor() {
    UploadRequest.requests.push(this);
  }
}

const originalXHR = global.XMLHttpRequest;
const originalFormData = global.FormData;
const originalFetch = global.fetch;
const originalOS = Platform.OS;

beforeEach(() => {
  Platform.OS = "android";
  api.setToken(null);
  api.setTokenProvider(async () => "clerk_chat_jwt");
  UploadRequest.requests = [];
  global.XMLHttpRequest = UploadRequest as unknown as typeof XMLHttpRequest;
  // Keep native URI parts intact, as React Native's XHR requires.
  global.FormData = jest.requireActual("react-native/Libraries/Network/FormData").default;
  global.fetch = jest.fn().mockRejectedValue(new Error("Unsupported FormDataPart implementation"));
});

afterEach(() => {
  api.setToken(null);
  api.setTokenProvider(null);
  global.XMLHttpRequest = originalXHR;
  global.FormData = originalFormData;
  global.fetch = originalFetch;
  Platform.OS = originalOS;
  jest.restoreAllMocks();
});

it.each(["android", "ios"] as const)("uploads on %s with a Clerk bearer and native URI bytes", async (os) => {
  Platform.OS = os;
  await expect(uploadChatImage(photo)).resolves.toBe("file_chat_photo");

  const xhr = UploadRequest.requests[0];
  expect(xhr.open).toHaveBeenCalledWith("POST", `${api.getApiBase()}/files`);
  expect(xhr.setRequestHeader.mock.calls).toEqual([
    ["Accept", "application/json"],
    ["Authorization", "Bearer clerk_chat_jwt"],
    ["X-GRIDGO-Role", "supplier"],
  ]);
  const form = xhr.send.mock.calls[0][0] as unknown as {
    getParts: () => { fieldName: string; string?: string; uri?: string; name?: string; type?: string }[];
  };
  expect(form.getParts()).toEqual([
    expect.objectContaining({ fieldName: "purpose", string: "support_chat_image" }),
    expect.objectContaining({ fieldName: "file", uri: photo.uri, name: photo.name, type: photo.mimeType }),
  ]);
  expect(global.fetch).not.toHaveBeenCalled();
});

it("does not start an upload without a session", async () => {
  api.setTokenProvider(async () => null);
  await expect(uploadChatImage(photo)).rejects.toThrow("Sign in again to send this photo.");
  expect(UploadRequest.requests).toHaveLength(0);
  expect(global.fetch).not.toHaveBeenCalled();
});

it("sends browser photo bytes with the original filename", async () => {
  Platform.OS = "web";
  global.FormData = originalFormData;
  jest.spyOn(api, "getApiBase").mockReturnValue("http://localhost:8787");
  const blob = new Blob(["photo bytes"], { type: "image/jpeg" });
  global.fetch = jest.fn(async () => ({ blob: async () => blob })) as unknown as typeof fetch;

  await expect(uploadChatImage(photo)).resolves.toBe("file_chat_photo");
  expect(global.fetch).toHaveBeenCalledWith(photo.uri);
  const form = UploadRequest.requests[0].send.mock.calls[0][0];
  expect(form.get("purpose")).toBe("support_chat_image");
  const file = form.get("file") as File;
  expect(file.name).toBe("photo.jpg");
  expect(file.type).toBe("image/jpeg");
  expect(file.size).toBe(blob.size);
});

it.each([
  [200, { file: { fileId: "not_stored" } }],
  [403, { error: "forbidden" }],
  [413, { error: "file_too_large" }],
  [201, {}],
  [201, { file: { fileId: "" } }],
  [201, { file: { fileId: 123 } }],
])("rejects an unconfirmed upload (%s, %j)", async (status, body) => {
  jest.spyOn(global, "XMLHttpRequest").mockImplementation(() => {
    const xhr = new UploadRequest();
    xhr.status = status;
    xhr.responseText = JSON.stringify(body);
    return xhr as unknown as XMLHttpRequest;
  });
  await expect(uploadChatImage(photo)).rejects.toThrow("That photo did not reach GRIDGO.");
});

it("rejects malformed storage responses", async () => {
  jest.spyOn(global, "XMLHttpRequest").mockImplementation(() => {
    const xhr = new UploadRequest();
    xhr.responseText = "not JSON";
    return xhr as unknown as XMLHttpRequest;
  });
  await expect(uploadChatImage(photo)).rejects.toThrow("That photo did not reach GRIDGO.");
});

it.each([
  ["onerror", "That photo did not reach GRIDGO."],
  ["ontimeout", "That photo took too long to send."],
  ["onabort", "The photo upload was cancelled."],
] as const)("settles a failed upload on %s", async (event, message) => {
  jest.spyOn(global, "XMLHttpRequest").mockImplementation(() => {
    const xhr = new UploadRequest();
    xhr.send.mockImplementation(() => { xhr[event]?.(); });
    return xhr as unknown as XMLHttpRequest;
  });
  await expect(uploadChatImage(photo)).rejects.toThrow(message);
});
