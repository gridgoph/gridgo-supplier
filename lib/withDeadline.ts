export async function withDeadline<T>(
  operation: Promise<T>,
  milliseconds: number,
  cancel?: () => void,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          cancel?.();
          reject(new Error("GRIDGO did not answer in time. Try again shortly."));
        }, milliseconds);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
