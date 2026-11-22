/**
 * An ID or permit must not stay on the phone after it is sent (report
 * F318781A): the app's own cached copy is deleted, never a gallery original.
 */
jest.mock("expo-file-system/legacy", () => ({
  cacheDirectory: "file:///data/user/0/ph.gridgo.supplier/cache/",
  deleteAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock("expo-image-picker", () => ({}));
jest.mock("expo-document-picker", () => ({}));

import { deleteAsync } from "expo-file-system/legacy";

import { discardPickedCopy } from "@/lib/pickFile";

const doc = (uri: string) => ({ uri, fileName: "id.jpg", mimeType: "image/jpeg", sizeBytes: 10 });

beforeEach(() => jest.clearAllMocks());

describe("discardPickedCopy", () => {
  it("deletes the copy the camera or gallery left in the app's cache", async () => {
    const uri = "file:///data/user/0/ph.gridgo.supplier/cache/ImagePicker/abc.jpg";
    await discardPickedCopy(doc(uri));
    expect(deleteAsync).toHaveBeenCalledWith(uri, { idempotent: true });
  });

  it("never touches a file outside the app's cache", async () => {
    await discardPickedCopy(doc("file:///storage/emulated/0/DCIM/Camera/IMG_1.jpg"));
    await discardPickedCopy(doc("content://media/external/images/media/42"));
    expect(deleteAsync).not.toHaveBeenCalled();
  });

  it("stays quiet when the delete fails", async () => {
    (deleteAsync as jest.Mock).mockRejectedValueOnce(new Error("busy"));
    await expect(
      discardPickedCopy(doc("file:///data/user/0/ph.gridgo.supplier/cache/x.jpg")),
    ).resolves.toBeUndefined();
  });

  it("releases a web object URL", async () => {
    const revoke = jest.fn();
    const original = URL.revokeObjectURL;
    URL.revokeObjectURL = revoke;
    try {
      await discardPickedCopy(doc("blob:http://localhost/1"));
      expect(revoke).toHaveBeenCalledWith("blob:http://localhost/1");
      expect(deleteAsync).not.toHaveBeenCalled();
    } finally {
      URL.revokeObjectURL = original;
    }
  });
});
