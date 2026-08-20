jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///cache/",
  downloadAsync: jest.fn(),
  createUploadTask: jest.fn(),
  FileSystemUploadType: { MULTIPART: 1 },
}));

import { Image } from "react-native";
import * as FileSystem from "expo-file-system/legacy";

import * as files from "@/lib/files";
import * as listingsApi from "@/lib/listingsApi";
import { seedStarterSample } from "@/lib/starterSample";

describe("seedStarterSample", () => {
  afterEach(() => {
    jest.restoreAllMocks();
    jest.mocked(FileSystem.downloadAsync).mockReset();
  });

  it("uploads the bundled GRIDGO sample and files it as the first photo", async () => {
    jest.spyOn(Image, "resolveAssetSource").mockReturnValue({
      uri: "http://127.0.0.1:8081/assets/lst_flyers.jpg",
      width: 1024,
      height: 1024,
      scale: 1,
    });
    jest.mocked(FileSystem.downloadAsync).mockResolvedValue({
      uri: "file:///cache/gridgo-starter-lst_flyers.jpg",
      status: 200,
      headers: {},
      mimeType: "image/jpeg",
    });
    jest.spyOn(files, "uploadFile").mockResolvedValue({ ok: true, fileId: "file_starter" });
    jest.spyOn(listingsApi, "attachPhoto").mockResolvedValue({ status: "ok", value: null });

    await expect(seedStarterSample("lst_flyers", "item_1")).resolves.toEqual({
      status: "ok",
      value: null,
    });

    expect(FileSystem.downloadAsync).toHaveBeenCalledWith(
      "http://127.0.0.1:8081/assets/lst_flyers.jpg",
      "file:///cache/gridgo-starter-lst_flyers.jpg",
    );
    expect(files.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        uri: "file:///cache/gridgo-starter-lst_flyers.jpg",
        fileName: "lst_flyers.jpg",
        mimeType: "image/jpeg",
      }),
      "catalog_item_photo",
      expect.any(Function),
    );
    expect(listingsApi.attachPhoto).toHaveBeenCalledWith("file_starter", "item_1", 0);
  });

  it("streams a file URI without copying it through the cache", async () => {
    jest.spyOn(Image, "resolveAssetSource").mockReturnValue({
      uri: "file:///android_asset/lst_flyers.jpg",
      width: 1024,
      height: 1024,
      scale: 1,
    });
    jest.spyOn(files, "uploadFile").mockResolvedValue({ ok: true, fileId: "file_starter" });
    jest.spyOn(listingsApi, "attachPhoto").mockResolvedValue({ status: "ok", value: null });

    await seedStarterSample("lst_flyers", "item_1");

    expect(FileSystem.downloadAsync).not.toHaveBeenCalled();
    expect(files.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({ uri: "file:///android_asset/lst_flyers.jpg" }),
      "catalog_item_photo",
      expect.any(Function),
    );
  });

  it("does nothing when this app has no sample for that starter", async () => {
    const upload = jest.spyOn(files, "uploadFile");
    const attach = jest.spyOn(listingsApi, "attachPhoto");

    await expect(seedStarterSample("lst_not_a_real_starter", "item_1")).resolves.toEqual({
      status: "ok",
      value: null,
    });

    expect(upload).not.toHaveBeenCalled();
    expect(attach).not.toHaveBeenCalled();
  });

  it("keeps the listing when the sample cannot be stored", async () => {
    jest.spyOn(Image, "resolveAssetSource").mockReturnValue({
      uri: "file:///android_asset/lst_flyers.jpg",
      width: 1024,
      height: 1024,
      scale: 1,
    });
    jest.spyOn(files, "uploadFile").mockResolvedValue({
      ok: false,
      error: "GRIDGO's file storage is not responding. Nothing was lost — try sending the file again in a moment.",
    });
    const attach = jest.spyOn(listingsApi, "attachPhoto");

    const result = await seedStarterSample("lst_flyers", "item_1");

    expect(result.status).toBe("failed");
    expect(attach).not.toHaveBeenCalled();
  });
});
