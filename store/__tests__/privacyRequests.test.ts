import { createPrivacyRequest, listPrivacyRequests, type PrivacyRequest } from "@/lib/api";
import { usePrivacyRequests } from "@/store/privacyRequests";

jest.mock("@/lib/api", () => ({ listPrivacyRequests: jest.fn(), createPrivacyRequest: jest.fn() }));

const list = listPrivacyRequests as jest.Mock;
const create = createPrivacyRequest as jest.Mock;

function request(id: string, requestedAt: string): PrivacyRequest {
  return { id, kind: "access", status: "pending", requestedAt, dueAt: "2026-10-24T02:00:00.000Z" };
}

beforeEach(() => {
  usePrivacyRequests.getState().reset();
  list.mockReset();
  create.mockReset();
});

it("lists the shop's requests newest first", async () => {
  list.mockResolvedValue([request("a", "2026-10-01T00:00:00Z"), request("b", "2026-10-09T00:00:00Z")]);
  await usePrivacyRequests.getState().load();
  expect(usePrivacyRequests.getState().requests.map((r) => r.id)).toEqual(["b", "a"]);
});

it("puts a sent request at the top of the list", async () => {
  list.mockResolvedValue([request("a", "2026-10-01T00:00:00Z")]);
  await usePrivacyRequests.getState().load();
  create.mockResolvedValue(request("c", "2026-10-14T00:00:00Z"));

  const sent = await usePrivacyRequests.getState().send("correction", "The pin label is wrong");

  expect(create).toHaveBeenCalledWith("correction", "The pin label is wrong");
  expect(sent?.id).toBe("c");
  expect(usePrivacyRequests.getState().requests.map((r) => r.id)).toEqual(["c", "a"]);
});

it("drops an answer that lands after the account changed", async () => {
  let answer: (value: PrivacyRequest[]) => void = () => {};
  list.mockReturnValue(new Promise((resolve) => (answer = resolve)));
  const pending = usePrivacyRequests.getState().load();

  usePrivacyRequests.getState().reset();
  answer([request("previous-shop", "2026-10-01T00:00:00Z")]);
  await pending;

  expect(usePrivacyRequests.getState().requests).toEqual([]);
  expect(usePrivacyRequests.getState().status).toBe("idle");
});
