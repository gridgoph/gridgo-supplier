import { useWhatsNewHistory, WHATS_NEW_REFRESH_MS } from "@/store/whatsNewHistory";

const list = [{ tag_name: "v1.0.9", body: "## What's new\n\nRelease type: Fix\n\n- Mended" }];

function ok() {
  return jest.fn(async () => ({ ok: true, status: 200, json: async () => list }) as unknown as Response);
}

beforeEach(() => {
  useWhatsNewHistory.setState({ status: "idle", online: [], loadedAt: null });
});

it("reads once, and again only after the refresh interval", async () => {
  const fetchImpl = ok();
  await useWhatsNewHistory.getState().load(1_000, fetchImpl);
  await useWhatsNewHistory.getState().load(2_000, fetchImpl);
  expect(fetchImpl).toHaveBeenCalledTimes(1);
  expect(useWhatsNewHistory.getState()).toMatchObject({
    status: "online",
    online: [{ version: "1.0.9", kind: "fix", notes: ["Mended"] }],
  });
  await useWhatsNewHistory.getState().load(1_000 + WHATS_NEW_REFRESH_MS, fetchImpl);
  expect(fetchImpl).toHaveBeenCalledTimes(2);
});

it("keeps what an earlier read found when a later one is offline", async () => {
  await useWhatsNewHistory.getState().load(1_000, ok());
  const offline = jest.fn(async () => {
    throw new TypeError("Network request failed");
  });
  await useWhatsNewHistory.getState().load(1_000 + WHATS_NEW_REFRESH_MS, offline);
  expect(useWhatsNewHistory.getState().status).toBe("offline");
  expect(useWhatsNewHistory.getState().online).toHaveLength(1);
});
