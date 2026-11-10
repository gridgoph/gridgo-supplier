import { actionLabel, orderActionRows } from "@/lib/shopTeam";

const ana = { userId: "user_ana", name: "Ana", role: "staff" };

describe("orderActionRows", () => {
  it("lists every recorded action newest first, including ones that moved no state", () => {
    const rows = orderActionRows(
      [
        { id: "a1", at: "2026-11-10T06:14:00.000Z", action: "order.transition", actor: ana },
        { id: "a2", at: "2026-11-10T06:20:00.000Z", action: "client_shop_chat.message_sent", actor: ana },
        { id: "a3", at: "2026-11-10T06:25:00.000Z", action: "file.saved", actor: { userId: "o", name: "Lovis", role: "owner" } },
      ],
      [{ at: "2026-11-10T06:14:00.400Z", state: "production", actor: ana }],
      (state) => (state === "production" ? "In production" : state),
    );
    expect(rows.map((row) => [row.who, row.what])).toEqual([
      ["Lovis (Owner)", "Added a file"],
      ["Ana (Staff)", "Messaged the client"],
      ["Ana (Staff)", "Moved it to In production"],
    ]);
  });

  it("speaks unknown codes and nameless legacy rows neutrally", () => {
    const rows = orderActionRows([
      { id: "x", at: "2026-11-10T06:14:00.000Z", action: "something.new_kind" },
      { at: "2026-11-09T06:14:00.000Z", action: 42, actor: { role: "system" } },
      { action: "order.updated" },
      null,
    ]);
    expect(rows).toEqual([
      { id: "x", at: "2026-11-10T06:14:00.000Z", what: "Updated the job", who: null },
      { id: "2026-11-09T06:14:00.000Z-1", at: "2026-11-09T06:14:00.000Z", what: "Updated the job", who: "GRIDGO" },
    ]);
  });

  it("keeps a step generic when time alone would have to name it", () => {
    const rows = orderActionRows(
      [{ id: "t", at: "2026-11-10T06:14:00.000Z", action: "order.transition", actor: ana }],
      [{ at: "2026-11-10T06:14:00.000Z", state: "production", by: "someone_else" }],
    );
    expect(rows[0].what).toBe("Moved the job on");
  });

  it("returns nothing for an older API without actions", () => {
    expect(orderActionRows(undefined)).toEqual([]);
    expect(actionLabel("payment.balance_submit")).toBe("Updated the payment");
  });
});
