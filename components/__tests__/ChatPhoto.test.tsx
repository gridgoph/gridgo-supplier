import { act, render, screen } from "@testing-library/react-native";

import { ChatPhoto } from "@/components/ChatPhoto";
import * as api from "@/lib/api";

jest.mock("@/lib/api", () => ({ getDownloadUrl: jest.fn() }));

it("does not show the previous attachment while its replacement is loading", async () => {
  const download = jest.mocked(api.getDownloadUrl);
  download.mockResolvedValueOnce({ fileId: "first", expiresInSeconds: 300, url: "https://example.test/first", expiresAt: "2026-10-07T12:05:00.000Z" });
  const { rerender } = await render(<ChatPhoto attachment={{ fileId: "first", originalFilename: "First photo" }} />);
  expect((await screen.findByLabelText("First photo")).props.source.uri).toBe("https://example.test/first");

  let resolveDownload!: (result: Awaited<ReturnType<typeof api.getDownloadUrl>>) => void;
  download.mockReturnValueOnce(new Promise((resolve) => { resolveDownload = resolve; }));
  await rerender(<ChatPhoto attachment={{ fileId: "second", originalFilename: "Second photo" }} />);
  expect(screen.getByText("Loading photo…")).toBeTruthy();
  expect(screen.queryByLabelText("First photo")).toBeNull();
  expect(screen.queryByLabelText("Second photo")).toBeNull();

  await act(async () => { resolveDownload({ fileId: "second", expiresInSeconds: 300, url: "https://example.test/second", expiresAt: "2026-10-07T12:05:00.000Z" }); });
  expect((await screen.findByLabelText("Second photo")).props.source.uri).toBe("https://example.test/second");
});
