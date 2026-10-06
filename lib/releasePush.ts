import { DOWNLOAD_URL } from "./appUpdate";
import { parsePushData } from "./push";

/** Release copy also identifies anonymous pushes, whose data stays {type: announcement}. */
export function releasePushDownloadUrl(data: unknown, title: unknown): string | null {
  if (parsePushData(data).type !== "announcement" || typeof title !== "string") return null;
  if (!/^GRIDGO Supplier (0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8}) is ready$/.test(title) || title.trim() !== title) return null;
  // Never open a URL supplied in the notification payload.
  return DOWNLOAD_URL;
}
