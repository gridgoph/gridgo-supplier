import { readInvalidation } from "@/lib/live";

it("ignores staff desk resources the supplier app does not know", () => {
  expect(readInvalidation(JSON.stringify({ resource: "issue-reports" }))).toBeNull();
  expect(readInvalidation(JSON.stringify({ resource: "chat", id: "message-1" }))).toBeNull();
  expect(readInvalidation(JSON.stringify({ resource: "jobs", id: "ord_1" }))).toEqual({
    resource: "jobs",
    id: "ord_1",
  });
});
