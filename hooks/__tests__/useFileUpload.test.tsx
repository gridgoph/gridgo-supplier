import { act, renderHook } from "@testing-library/react-native";
import * as ImagePicker from "expo-image-picker";
import * as DocumentPicker from "expo-document-picker";

import { useFileUpload } from "@/hooks/useFileUpload";
import { uploadFile } from "@/lib/files";

jest.mock("expo-image-picker", () => ({
  launchImageLibraryAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(async () => ({ granted: true })),
}));
jest.mock("expo-document-picker", () => ({ getDocumentAsync: jest.fn() }));
jest.mock("@/lib/webFilePick", () => ({ canPickOnWeb: () => false }));
jest.mock("@/lib/files", () => ({ ...jest.requireActual("@/lib/files"), uploadFile: jest.fn() }));

const asset = (name: string, fileSize = 1000) => ({
  uri: `file:///${name}`, fileName: name, mimeType: "image/jpeg", fileSize, width: 10, height: 10,
});

beforeEach(() => {
  (uploadFile as jest.Mock).mockReset();
});

it("takes several gallery photos at once and keeps a failed one beside the others", async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false, assets: [asset("a.jpg"), asset("b.jpg"), asset("c.jpg")],
  });
  (uploadFile as jest.Mock).mockImplementation(async (item: { fileName: string }) =>
    item.fileName === "b.jpg"
      ? { ok: false, error: "That did not reach GRIDGO. Send it again." }
      : { ok: true, fileId: `file_${item.fileName}` },
  );
  const { result } = await renderHook(() => useFileUpload("fulfilment_proof"));

  await act(async () => { await result.current.pickImages(10); });

  expect(ImagePicker.launchImageLibraryAsync).toHaveBeenCalledWith(
    expect.objectContaining({ allowsMultipleSelection: true, selectionLimit: 10 }),
  );
  expect(uploadFile).toHaveBeenCalledTimes(3);
  expect(result.current.items.map((i) => [i.fileName, i.stage, i.fileId])).toEqual([
    ["a.jpg", "stored", "file_a.jpg"],
    ["b.jpg", "failed", null],
    ["c.jpg", "stored", "file_c.jpg"],
  ]);
  expect(result.current.items[1].error).toBe("That did not reach GRIDGO. Send it again.");
});

it("never takes more than the room the part has left", async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({
    canceled: false, assets: [asset("a.jpg"), asset("b.jpg"), asset("c.jpg")],
  });
  (uploadFile as jest.Mock).mockResolvedValue({ ok: true, fileId: "file_x" });
  const { result } = await renderHook(() => useFileUpload("fulfilment_proof"));

  await act(async () => { await result.current.pickImages(2); });

  expect(result.current.items.map((i) => i.fileName)).toEqual(["a.jpg", "b.jpg"]);
});

it("fails an oversized file on its own without sending it", async () => {
  (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
    canceled: false,
    assets: [
      { uri: "file:///big.pdf", name: "big.pdf", mimeType: "application/pdf", size: 300 * 1024 * 1024 },
      { uri: "file:///ok.pdf", name: "ok.pdf", mimeType: "application/pdf", size: 1000 },
    ],
  });
  (uploadFile as jest.Mock).mockResolvedValue({ ok: true, fileId: "file_ok" });
  const { result } = await renderHook(() => useFileUpload("fulfilment_proof"));

  await act(async () => { await result.current.pickDocuments(); });

  expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(expect.objectContaining({ multiple: true }));
  expect(uploadFile).toHaveBeenCalledTimes(1);
  expect(result.current.items.map((i) => i.stage)).toEqual(["failed", "stored"]);
});

it("does nothing when the gallery is closed", async () => {
  (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
  const { result } = await renderHook(() => useFileUpload("fulfilment_proof"));
  await act(async () => { await result.current.pickImages(); });
  expect(result.current.items).toEqual([]);
});
