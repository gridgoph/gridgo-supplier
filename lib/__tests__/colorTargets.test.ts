import {
  artworkColorDetail,
  artworkColorLabel,
  artworkColorsOf,
  artworkColorsView,
  colorFileNamer,
  colorTargetsOf,
  exactColourCount,
  normalisePantone,
  swatchKind,
  swatchNote,
  targetFoundIn,
  type ArtworkColorsEntry,
} from "@/lib/colorTargets";

const pantone = { label: "School maroon", format: "pantone", value: "PANTONE 201 C", cmyk: null, hex: null, swatchHex: "#9D2235", swatchApproximate: true };
const bare = { label: "Crest gold", format: "pantone", value: "PANTONE 7406 C", cmyk: null, hex: null, swatchHex: null, swatchApproximate: null };
const cmyk = { label: "Brand red", format: "cmyk", value: "C0 M100 Y65 K34", cmyk: { c: 0, m: 100, y: 65, k: 34 }, hex: null, swatchHex: "#A8003B", swatchApproximate: true };
const hex = { label: "Logo blue", format: "hex", value: "#1A5FB4", cmyk: null, hex: "#1A5FB4", swatchHex: "#1A5FB4", swatchApproximate: false };

describe("colorTargetsOf", () => {
  it("reads GRIDGO's normalised targets and skips what it cannot read", () => {
    expect(colorTargetsOf({ colorTargets: [pantone, cmyk, hex, { label: "" }, null, "x"] })).toHaveLength(3);
  });

  it("is empty on an older GRIDGO and on a line without colours", () => {
    expect(colorTargetsOf({})).toEqual([]);
    expect(colorTargetsOf({ colorTargets: [] })).toEqual([]);
  });

  it("counts the colours across a job's items", () => {
    expect(exactColourCount([{ colorTargets: [pantone, hex] }, {}, { colorTargets: [cmyk] }])).toBe(3);
  });
});

describe("what a swatch may claim", () => {
  it("calls a hex a screen colour, CMYK approximate and a client's Pantone hex theirs", () => {
    expect(swatchKind(hex)).toBe("exact");
    expect(swatchNote(hex)).toBe("Screen colour");
    expect(swatchKind(cmyk)).toBe("approximate");
    expect(swatchNote(cmyk)).toBe("Approximate on screen");
    expect(swatchNote(pantone)).toBe("Client's approximate swatch");
  });

  it("keeps a Pantone without a hex as text only", () => {
    const [target] = colorTargetsOf({ colorTargets: [bare] });
    expect(swatchKind(target)).toBe("none");
    expect(swatchNote(target)).toBe("Pantone code only, no swatch");
  });

  it("never paints a swatch from a value that is not a hex", () => {
    const [target] = colorTargetsOf({ colorTargets: [{ ...pantone, swatchHex: "red" }] });
    expect(target.swatchHex).toBeNull();
    expect(target.swatchApproximate).toBeNull();
  });
});

describe("the colours GRIDGO read from a file", () => {
  it("says a file it could not read in a sentence, never as an empty palette", () => {
    const view = artworkColorsView({ status: "unknown", reasons: ["not_read_for_this_file_type"], colors: [] });
    expect(view).toEqual({
      kind: "unknown",
      headline: "We could not read the colours in this file",
      notes: ["GRIDGO does not read colours from this file type."],
    });
  });

  it("explains a file uploaded before colours were read without asking the shop to upload it", () => {
    const view = artworkColorsView({ status: "unknown", reasons: ["not_read_at_upload"], colors: [] });
    expect(view.notes).toEqual(["This file was uploaded before GRIDGO read colours."]);
  });

  it("lists a partly read file's colours and says what was left out", () => {
    const view = artworkColorsView({
      status: "partial",
      reasons: ["embedded_images_not_read"],
      colors: [{ kind: "spot", name: "PANTONE 185 C", space: "cmyk", cmyk: { c: 0, m: 91, y: 76, k: 6 }, hex: "#F0163A", uses: 3, shareBps: null }],
    });
    expect(view.kind).toBe("read");
    expect(view.notes).toEqual(["Pictures placed in the PDF were not read."]);
  });

  it("names spot colours, process colours and a PNG colour's share", () => {
    expect(artworkColorLabel({ kind: "spot", name: "PANTONE 185 C", space: null, cmyk: null, hex: null, uses: 0, shareBps: null })).toBe("PANTONE 185 C");
    expect(artworkColorDetail({ kind: "spot", name: "Cut", space: null, cmyk: null, hex: null, uses: 0, shareBps: null })).toBe("Spot colour, not used");
    const process = { kind: "process", name: null, space: "cmyk", cmyk: { c: 100, m: 50, y: 0, k: 0 }, hex: "#0080FF", uses: 12, shareBps: null };
    expect(artworkColorLabel(process)).toBe("C100 M50 Y0 K0");
    expect(artworkColorDetail(process)).toBe("CMYK");
    const pixels = { kind: "pixels", name: null, space: "rgb", cmyk: null, hex: "#1A5FB4", uses: null, shareBps: 6230 };
    expect(artworkColorLabel(pixels)).toBe("#1A5FB4");
    expect(artworkColorDetail(pixels)).toBe("62% of the image");
    expect(artworkColorDetail({ ...pixels, shareBps: 60 })).toBe("Under 1% of the image");
  });

  it("reads one entry per uploaded file", () => {
    expect(artworkColorsOf({ artworkColors: [{ fileId: "file_a", colors: { status: "read", reasons: [], colors: [] } }, { colors: {} }] }))
      .toEqual([{ fileId: "file_a", colors: { status: "read", reasons: [], colors: [] } }]);
  });
});

describe("targetFoundIn", () => {
  const entries: ArtworkColorsEntry[] = [
    {
      fileId: "file_front",
      colors: {
        status: "read",
        reasons: [],
        colors: [
          { kind: "spot", name: "PMS 201C", space: "cmyk", cmyk: { c: 0, m: 100, y: 63, k: 29 }, hex: "#B5003A", uses: 2, shareBps: null },
          { kind: "process", name: null, space: "cmyk", cmyk: { c: 0, m: 100, y: 65, k: 34 }, hex: "#A8003B", uses: 4, shareBps: null },
        ],
      },
    },
    {
      fileId: "file_logo",
      colors: { status: "read", reasons: [], colors: [{ kind: "pixels", name: null, space: "rgb", cmyk: null, hex: "#1A5FB4", uses: null, shareBps: 5000 }] },
    },
  ];
  const [p, c, h] = colorTargetsOf({ colorTargets: [pantone, cmyk, hex] });

  it("marks a file that states the colour exactly", () => {
    expect(targetFoundIn(p, entries)).toEqual(["file_front"]);
    expect(targetFoundIn(c, entries)).toEqual(["file_front"]);
    expect(targetFoundIn(h, entries)).toEqual(["file_logo"]);
  });

  it("never marks a near colour", () => {
    const [near] = colorTargetsOf({ colorTargets: [{ ...hex, value: "#1A5FB5", hex: "#1A5FB5", swatchHex: "#1A5FB5" }] });
    expect(targetFoundIn(near, entries)).toEqual([]);
  });

  it("normalises a Pantone name the way GRIDGO does", () => {
    expect(normalisePantone("pms 201c")).toBe("PANTONE 201 C");
    expect(normalisePantone("PANTONE® warm red c")).toBe("PANTONE Warm Red C");
  });
});

describe("colorFileNamer", () => {
  it("prefers the client's label, then the uploaded name, then its place", () => {
    const name = colorFileNamer(
      [{ fileId: "file_a", label: "Front" }, { fileId: "file_b", label: null }, { fileId: "file_c", label: null }],
      (fileId) => (fileId === "file_b" ? "logo.png" : null),
    );
    expect(name("file_a")).toBe("Front");
    expect(name("file_b")).toBe("logo.png");
    expect(name("file_c")).toBe("File 3");
  });

  it("calls a single unnamed file the client's file", () => {
    expect(colorFileNamer([{ fileId: "file_a", label: null }], () => null)("file_a")).toBe("The client's file");
  });
});
