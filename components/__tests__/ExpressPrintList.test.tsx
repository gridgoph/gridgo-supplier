import { render, screen } from "@testing-library/react-native";

import { ExpressPrintList } from "@/components/ExpressPrintList";
import { expressView } from "@/lib/expressOrder";
import type { Order } from "@/lib/api";

const print = (fileId: string, member?: { id: string; name: string }) => ({
  fileId,
  pages: { total: 3, range: null, printed: 3 },
  copies: 1,
  colour: "bw",
  paper: "a4",
  sides: "one",
  ...(member ? { groupMemberId: member.id, groupMemberName: member.name } : {}),
});

function view(printSettings: unknown[], groupOrder?: unknown) {
  return expressView({
    orderType: "express",
    fulfillmentMode: "pickup",
    expressOrder: { status: "accepted", printSettings },
    groupOrder,
  } as unknown as Order)!;
}

it("draws one card per person with the pack hint on a group order", async () => {
  await render(
    <ExpressPrintList
      view={view([print("f1", { id: "a", name: "Member A" }), print("f2", { id: "b", name: "Member B" })], {
        id: "g",
        memberCount: 2,
        hostName: "Host H",
      })}
    />,
  );
  expect(screen.getByText("Pack each person separately")).toBeTruthy();
  expect(screen.getAllByTestId("express-bundle")).toHaveLength(2);
  expect(screen.getAllByTestId("express-bundle-name").map((n) => n.props.children)).toEqual(["Member A", "Member B"]);
  expect(screen.getByText("1 of 2")).toBeTruthy();
});

it("leaves an ordinary order as one list with no group words", async () => {
  await render(<ExpressPrintList view={view([print("f1"), print("f2")])} />);
  expect(screen.queryByTestId("express-pack-hint")).toBeNull();
  expect(screen.queryByTestId("express-bundle")).toBeNull();
  expect(screen.getByText("File 2")).toBeTruthy();
});
