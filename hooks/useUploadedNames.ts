import { useEffect, useState } from "react";

import { getFile } from "@/lib/api";

/**
 * The names files were uploaded with, read once per file. A file that cannot
 * be read stays unnamed, and the caller falls back to its own words for it.
 */
export function useUploadedNames(fileIds: readonly string[]): Record<string, string> {
  const [names, setNames] = useState<Record<string, string>>({});
  const key = fileIds.join(" ");
  useEffect(() => {
    let current = true;
    for (const fileId of key ? key.split(" ") : []) {
      getFile(fileId).then(
        (file) => {
          const name = file.originalFilename?.trim();
          if (current && name) setNames((known) => (known[fileId] === name ? known : { ...known, [fileId]: name }));
        },
        () => undefined,
      );
    }
    return () => {
      current = false;
    };
  }, [key]);
  return names;
}
