import { create } from "qrcode";

/**
 * The dark modules of a QR code as one SVG path, in module units.
 *
 * Pure so it can be tested without a renderer. Medium error correction: the
 * code is read off a phone screen, which is sharp but often at an angle.
 */
export function qrPath(text: string): { size: number; path: string } {
  const qr = create(text, { errorCorrectionLevel: "M" });
  const size = qr.modules.size;
  const data = qr.modules.data;
  let path = "";
  for (let y = 0; y < size; y += 1) {
    let run = 0;
    for (let x = 0; x <= size; x += 1) {
      const dark = x < size && data[y * size + x] === 1;
      if (dark) {
        run += 1;
      } else if (run > 0) {
        path += `M${x - run} ${y}h${run}v1h-${run}z`;
        run = 0;
      }
    }
  }
  return { size, path };
}
