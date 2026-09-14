import { fireEvent, render, screen } from "@testing-library/react-native";

import { UploadList } from "@/components/UploadList";
import { newUploadItem, type UploadItem } from "@/lib/files";

function item(partial: Partial<UploadItem> = {}): UploadItem {
  return {
    ...newUploadItem({
      key: "up_1",
      uri: "file:///run.jpg",
      fileName: "run.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 48_000,
    }),
    ...partial,
  };
}

describe("UploadList", () => {
  it("shows the photograph for an image, not a paperclip", async () => {
    await render(
      <UploadList
        items={[item({ stage: "uploading", progress: 0.4 })]}
        onRetry={jest.fn()}
        onRemove={jest.fn()}
        emptyHint="No evidence yet."
      />,
    );

    const photo = screen.getByLabelText("run.jpg");
    expect(photo.props.source).toEqual({ uri: "file:///run.jpg" });
    expect(screen.getByText("Sending 40%")).toBeTruthy();
  });

  it("keeps showing the local photograph once GRIDGO has stored it", async () => {
    await render(
      <UploadList
        items={[item({ stage: "stored", progress: 1, fileId: "file_print" })]}
        onRetry={jest.fn()}
        onRemove={jest.fn()}
        emptyHint="No evidence yet."
      />,
    );

    expect(screen.getByLabelText("run.jpg").props.source).toEqual({ uri: "file:///run.jpg" });
    expect(screen.getByText("Saved. Ready to file")).toBeTruthy();
  });

  it("shows a document tile for a PDF, not a broken image", async () => {
    await render(
      <UploadList
        items={[
          item({
            uri: "file:///spec.pdf",
            fileName: "spec.pdf",
            mimeType: "application/pdf",
            stage: "stored",
            progress: 1,
            fileId: "file_pdf",
          }),
        ]}
        onRetry={jest.fn()}
        onRemove={jest.fn()}
        emptyHint="No evidence yet."
      />,
    );

    expect(screen.getByText("spec.pdf")).toBeTruthy();
    expect(screen.getByText("PDF")).toBeTruthy();
    expect(screen.queryByLabelText("spec.pdf")).toBeNull();
  });

  it("keeps retry and remove on a photograph that failed to send", async () => {
    const onRetry = jest.fn();
    const onRemove = jest.fn();
    await render(
      <UploadList
        items={[item({ stage: "failed", error: "The file could not be sent." })]}
        onRetry={onRetry}
        onRemove={onRemove}
        emptyHint="No evidence yet."
      />,
    );

    expect(screen.getByLabelText("run.jpg").props.source).toEqual({ uri: "file:///run.jpg" });
    await fireEvent.press(screen.getByLabelText("Send run.jpg again"));
    await fireEvent.press(screen.getByLabelText("Remove run.jpg"));
    expect(onRetry).toHaveBeenCalledWith("up_1");
    expect(onRemove).toHaveBeenCalledWith("up_1");
  });
});
