import { PUBLISHED_FILE_FORMATS, UNOPENED_FILE_MESSAGE } from "@/data/fileFormats";
import { readPublishedFormats, resolveFormatQuery, uploadedFileOptions } from "@/lib/fileFormatResolve";

describe("finding a type a shop typed", () => {
  it("ticks JPEG when the shop types jpg", () => {
    const found = resolveFormatQuery("JPG", PUBLISHED_FILE_FORMATS);
    expect(found.status).toBe("matched");
    expect(found.format?.code).toBe("jpeg");
  });

  it("ticks a Canva link from the word Canva", () => {
    const found = resolveFormatQuery("Canva", PUBLISHED_FILE_FORMATS);
    expect(found.status).toBe("matched");
    expect(found.format?.code).toBe("canva_link");
  });

  it("does not invent AI, and tells the shop to take a link", () => {
    const found = resolveFormatQuery("AI", PUBLISHED_FILE_FORMATS);
    expect(found.status).toBe("unknown");
    expect(found.format).toBeNull();
    expect(found.message).toBe(UNOPENED_FILE_MESSAGE);
  });

  it("recognises 3MF but will not pretend GRIDGO can store it", () => {
    const found = resolveFormatQuery("3mf", PUBLISHED_FILE_FORMATS);
    expect(found.status).toBe("link_only");
    expect(found.format?.code).toBe("3mf");
    expect(found.message).toBe(UNOPENED_FILE_MESSAGE);
  });

  it("keeps 3MF off the file chips unless the listing already named it", () => {
    expect(uploadedFileOptions(PUBLISHED_FILE_FORMATS, []).map((format) => format.code)).toEqual([
      "pdf",
      "png",
      "jpeg",
      "webp",
      "psd",
    ]);
    expect(
      uploadedFileOptions(PUBLISHED_FILE_FORMATS, ["3mf"]).map((format) => format.code),
    ).toEqual(["pdf", "png", "jpeg", "webp", "psd", "3mf"]);
  });

  it("reads GRIDGO's list, and ignores a shapeless payload", () => {
    expect(
      readPublishedFormats({
        formats: [
          {
            code: "jpeg",
            displayName: "JPEG",
            inputKind: "file",
            uploadable: true,
            aliases: ["jpeg", "jpg"],
          },
        ],
      }).map((format) => format.code),
    ).toEqual(["jpeg"]);
    expect(readPublishedFormats({ formats: "nope" })).toEqual([]);
  });
});
