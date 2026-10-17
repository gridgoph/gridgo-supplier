import { agreedCoverSpine, coverSpineRows, spineLines, type AgreedCoverSpine } from "@/lib/coverSpine";

type Given = Extract<AgreedCoverSpine, { status: "given" }>;

const given = {
  status: "given",
  cover: "separate_file",
  coverFileId: "file_cover",
  spine: { institutionCode: "ABC-CS", title: "Flood Risk Mapping of a River Basin", author: "Sample Author", month: 10, year: 2026 },
  spineDate: "October 2026",
  spineSummary: "ABC-CS | Flood Risk Mapping of a River Basin | Sample Author | October 2026",
};

describe("agreedCoverSpine", () => {
  it("is null for a line whose product does not ask, and for an older order", () => {
    expect(agreedCoverSpine({ coverSpine: null })).toBeNull();
    expect(agreedCoverSpine({})).toBeNull();
  });

  it("reads a line that asked and was given nothing as not given", () => {
    const record = agreedCoverSpine({
      coverSpine: { status: "not_given", cover: null, coverFileId: null, spine: null, spineDate: null, spineSummary: null },
    });
    expect(record).toEqual({ status: "not_given" });
    expect(coverSpineRows(record!)).toEqual([{ label: "Cover and spine", value: "Not given", muted: true }]);
  });

  it("states the cover and each spine line in reading order", () => {
    const record = agreedCoverSpine({ coverSpine: given }) as Given;
    expect(coverSpineRows(record)).toEqual([
      { label: "Cover", value: "Separate cover page", muted: false },
      { label: "Institution code", value: "ABC-CS" },
      { label: "Title on spine", value: "Flood Risk Mapping of a River Basin" },
      { label: "Author", value: "Sample Author" },
      { label: "Month and year", value: "October 2026" },
    ]);
    expect(spineLines(record).map((line) => line.text)).toEqual([
      "ABC-CS",
      "Flood Risk Mapping of a River Basin",
      "Sample Author",
      "October 2026",
    ]);
  });

  it("skips an empty institution code and names the month itself when GRIDGO sent no date", () => {
    const record = agreedCoverSpine({
      coverSpine: { ...given, cover: "text_only", coverFileId: null, spine: { ...given.spine, institutionCode: null }, spineDate: null },
    }) as Given;
    expect(coverSpineRows(record).map((row) => row.label)).toEqual(["Cover", "Title on spine", "Author", "Month and year"]);
    expect(coverSpineRows(record)[3].value).toBe("October 2026");
    expect(spineLines(record)[0].field).toBe("title");
  });

  it("keeps a cover file only for a separate cover page", () => {
    expect(agreedCoverSpine({ coverSpine: given })).toMatchObject({ coverFileId: "file_cover" });
    expect(agreedCoverSpine({ coverSpine: { ...given, cover: "first_page" } })).toMatchObject({ coverFileId: null });
  });
});
