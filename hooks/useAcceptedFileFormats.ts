import { useEffect, useState } from "react";

import { PUBLISHED_FILE_FORMATS, type PublishedFileFormat } from "@/data/fileFormats";
import * as api from "@/lib/api";

/**
 * The platform's artwork types, as GRIDGO names them today.
 *
 * The frozen chart is the fallback while the list is unreachable. Once the
 * list arrives, it is what the plus field and the chips both read, so a type
 * Super Admin opened is tappable without an app release.
 */
export function useAcceptedFileFormats(): readonly PublishedFileFormat[] {
  const [formats, setFormats] = useState<readonly PublishedFileFormat[]>(PUBLISHED_FILE_FORMATS);

  useEffect(() => {
    let cancelled = false;
    api
      .getAcceptedFileFormats()
      .then((listed) => {
        if (!cancelled && listed.length > 0) setFormats(listed);
      })
      .catch(() => {
        // Stay on the chart. A shop still has to tick something, and inventing
        // an empty set would lock every listing on override.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return formats;
}
