import {
  HELD_READ_MAX_AGE_MS,
  PHOTO_LINK_MARGIN_MS,
  earliestPhotoExpiry,
  heldReadIsStale,
  linkIsStale,
  photoLinkExpiry,
} from "@/lib/photoLinks";

const NOW = Date.parse("2026-09-28T02:00:00.000Z");
const at = (ms: number) => new Date(NOW + ms).toISOString();

describe("photo link staleness", () => {
  it("calls a link stale inside the margin and fresh outside it", () => {
    expect(linkIsStale(NOW - 1, NOW)).toBe(true);
    expect(linkIsStale(NOW + PHOTO_LINK_MARGIN_MS, NOW)).toBe(true);
    expect(linkIsStale(NOW + PHOTO_LINK_MARGIN_MS + 1, NOW)).toBe(false);
  });

  it("never calls a link with no known expiry stale, so a guess cannot loop", () => {
    expect(linkIsStale(null, NOW)).toBe(false);
    expect(photoLinkExpiry({ downloadUrlExpiresAt: "not a date" })).toBeNull();
    expect(photoLinkExpiry({ downloadUrlExpiresAt: null })).toBeNull();
  });

  it("finds the soonest expiry across a board", () => {
    const photo = (expires: string | null) => ({ fileId: "f", sortOrder: 0, altText: null, downloadUrlExpiresAt: expires });
    expect(
      earliestPhotoExpiry([
        { photos: [photo(at(300_000)), photo(null)] },
        null,
        { photos: [photo(at(120_000))] },
      ]),
    ).toBe(NOW + 120_000);
    expect(earliestPhotoExpiry([{ photos: [] }])).toBeNull();
  });

  it("re-reads a held read at four minutes, or sooner when a link is stale", () => {
    expect(heldReadIsStale({ readAt: null, earliestExpiry: NOW - 1 }, NOW)).toBe(false);
    expect(heldReadIsStale({ readAt: NOW - 60_000, earliestExpiry: null }, NOW)).toBe(false);
    expect(heldReadIsStale({ readAt: NOW - HELD_READ_MAX_AGE_MS, earliestExpiry: null }, NOW)).toBe(true);
    expect(heldReadIsStale({ readAt: NOW - 60_000, earliestExpiry: NOW + 30_000 }, NOW)).toBe(true);
  });
});
