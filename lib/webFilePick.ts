import { Platform } from "react-native";

/**
 * Browser file pick. Expo's camera, library and document pickers are native
 * modules; on web a hidden `<input type="file">` is what opens the dialog.
 */

export type WebPickedAsset = {
  uri: string;
  name: string;
  mimeType: string | null;
  size: number | null;
  file: File;
};

export function canPickOnWeb(): boolean {
  return (
    Platform.OS === "web" &&
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  );
}

/** Opens the browser file dialog. Null when the person closes it. */
export async function pickFileOnWeb(accept: string): Promise<WebPickedAsset | null> {
  const picked = await pickOnWeb(accept, false);
  return picked[0] ?? null;
}

/** The same dialog, taking several files at once. Empty when the person closes it. */
export function pickFilesOnWeb(accept: string): Promise<WebPickedAsset[]> {
  return pickOnWeb(accept, true);
}

function pickOnWeb(accept: string, multiple: boolean): Promise<WebPickedAsset[]> {
  return new Promise((resolve, reject) => {
    if (!canPickOnWeb()) {
      reject(new Error("web_picker_unavailable"));
      return;
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.setAttribute("data-gridgo-web-file-pick", "true");

    let settled = false;
    const finish = (assets: WebPickedAsset[]) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(assets);
    };

    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      finish(
        files.map((file) => ({
          uri: objectUrlFor(file),
          name: file.name,
          mimeType: file.type || null,
          size: Number.isFinite(file.size) ? file.size : null,
          file,
        })),
      );
    });
    input.addEventListener("cancel", () => finish([]));

    document.body?.appendChild(input);
    input.click();
  });
}

function objectUrlFor(file: File): string {
  try {
    if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
      return URL.createObjectURL(file);
    }
  } catch {
    // Expo's winter URL needs a native BlobModule that Jest does not have.
  }
  return "";
}
