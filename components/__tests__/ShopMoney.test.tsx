import { fireEvent, render, screen } from "@testing-library/react-native";

import { HowYouEarn } from "@/components/money/HowYouEarn";
import { LaunchBonusCard } from "@/components/money/LaunchBonusCard";
import { MoneyActivity } from "@/components/money/MoneyActivity";
import { ShopBalances } from "@/components/money/ShopBalances";
import { launchBonusSummary, readShopMoney, readShopMoneySchedule } from "@/lib/shopMoney";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

const NOW = new Date("2026-11-22T02:00:00.000Z");

const SCHEDULE = readShopMoneySchedule({
  payoutTime: "16:00",
  minimumMinor: 10000,
  payDeadline: "18:00",
  reminderTime: "17:00",
  bonusRateBps: 2000,
  bonusDays: 7,
  bonusCapMinor: 50000,
});

function money(balances: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  return readShopMoney({
    balances: {
      owedMinor: 0,
      owingMinor: 0,
      netMinor: 0,
      paidMinor: 0,
      overdue: false,
      paused: false,
      nextPayoutAt: "2026-11-23T08:00:00.000Z",
      ...balances,
    },
    jobs: [],
    history: [],
    earningsByDay: {},
    paymentMethods: {},
    payGridgo: null,
    ...extra,
  })!;
}

const PAY = {
  requestId: "p1",
  amountMinor: 3800,
  reference: "GG-PAY2210",
  deadlineAt: "2026-11-22T10:00:00.000Z",
  confirmation: "manual",
  qrImageUrl: "/public/payment-qr?v=f1",
};

beforeEach(() => mockPush.mockClear());

describe("ShopBalances", () => {
  it("shows an Owner with a positive net both balances, the net and the next payout, with no yellow action", async () => {
    const read = money({ owedMinor: 14400, owingMinor: 0, netMinor: 14400 });
    await render(<ShopBalances balances={read.balances} schedule={SCHEDULE} payGridgo={null} now={NOW} />);
    expect(screen.getByText("GRIDGO owes you")).toBeTruthy();
    expect(screen.getByText("You owe GRIDGO")).toBeTruthy();
    expect(screen.getByText("GRIDGO pays you")).toBeTruthy();
    expect(screen.getAllByText("₱144.00").length).toBe(2);
    expect(screen.getByTestId("next-payout").props.children).toContain("Next payout tomorrow, 4:00 PM");
    expect(screen.queryByTestId("pay-gridgo-open")).toBeNull();
  });

  it("asks a shop with a negative net before 6 PM to pay, and opens the Pay GRIDGO sheet", async () => {
    const read = money({ owedMinor: 0, owingMinor: 3800, netMinor: -3800 }, { payGridgo: PAY });
    await render(
      <ShopBalances balances={read.balances} schedule={SCHEDULE} payGridgo={read.payGridgo} now={NOW} />,
    );
    expect(screen.getByText("You pay GRIDGO")).toBeTruthy();
    expect(screen.getByTestId("pay-gridgo-due")).toBeTruthy();
    expect(screen.getByText("Pay GRIDGO ₱38.00")).toBeTruthy();
    expect(screen.queryByTestId("pay-gridgo-paused")).toBeNull();
    await fireEvent.press(screen.getByTestId("pay-gridgo-open"));
    expect(mockPush).toHaveBeenCalledWith("/pay-gridgo");
  });

  it("tells a shop still unpaid after 6 PM that new orders are paused", async () => {
    const read = money(
      { owedMinor: 0, owingMinor: 3800, netMinor: -3800, overdue: true, paused: true },
      { payGridgo: PAY },
    );
    await render(
      <ShopBalances balances={read.balances} schedule={SCHEDULE} payGridgo={read.payGridgo} now={NOW} />,
    );
    expect(screen.getByTestId("pay-gridgo-paused")).toBeTruthy();
    expect(screen.getByText("New orders are paused")).toBeTruthy();
    expect(screen.getByText("Pay ₱38.00")).toBeTruthy();
  });

  it("has no Pay GRIDGO while a negative net has no request yet", async () => {
    const read = money({ owedMinor: 0, owingMinor: 2300, netMinor: -2300 });
    await render(<ShopBalances balances={read.balances} schedule={SCHEDULE} payGridgo={null} now={NOW} />);
    expect(screen.queryByTestId("pay-gridgo-open")).toBeNull();
    expect(screen.getByTestId("next-payout").props.children).toBe(
      "Still owed at 4:00 PM, it is due by 6:00 PM with Pay GRIDGO.",
    );
  });
});

describe("LaunchBonusCard", () => {
  const job = (amountMinor: number) => ({
    orderId: `o${amountMinor}`,
    createdAt: "2026-11-21T05:00:00.000Z",
    clientPayment: { methods: ["in_app_qr" as const], settlement: "daily" as const },
    shopPayMinor: 7200,
    bonus: { amountMinor, firstOrderAt: "2026-11-21T00:00:00.000Z", days: 7, rateBps: 2000, capMinor: 50000 },
  });

  it("shows the bonus in total during launch week", async () => {
    await render(<LaunchBonusCard summary={launchBonusSummary([job(1440)], NOW)!} now={NOW} />);
    expect(screen.getByTestId("launch-bonus-total").props.children).toEqual(["+", "₱14.40"]);
    expect(screen.getByTestId("launch-bonus-line").props.children).toContain("+20% on your shop pay");
  });

  it("says the cap is reached", async () => {
    await render(<LaunchBonusCard summary={launchBonusSummary([job(50000)], NOW)!} now={NOW} />);
    expect(screen.getByTestId("launch-bonus-line").props.children).toContain("₱500.00 launch bonus cap");
  });
});

describe("MoneyActivity", () => {
  const read = money(
    { owedMinor: 7200, netMinor: 7200 },
    {
      jobs: [
        {
          orderId: "ord_7c20aa11",
          createdAt: "2026-11-21T05:00:00.000Z",
          clientPayment: { methods: ["in_app_qr", "voucher"], settlement: "daily" },
          shopPayMinor: 7200,
          bonus: { amountMinor: 1440, firstOrderAt: "2026-11-21T00:00:00.000Z", days: 7, rateBps: 2000, capMinor: 50000 },
        },
      ],
      history: [
        { id: "h1", kind: "entitlement", orderId: "ord_7c20aa11", at: "2026-11-21T05:52:00.000Z", owedDeltaMinor: 7200, owingDeltaMinor: 0 },
        { id: "h2", kind: "payout", orderId: null, at: "2026-11-20T08:02:00.000Z", owedDeltaMinor: -6000, owingDeltaMinor: 0, data: { reference: "TX-7741" } },
      ],
      earningsByDay: { "2026-11-21": 7200 },
      paymentMethods: { in_app_qr: 1, voucher: 1 },
    },
  );

  it("shows how each job was paid, its daily tag and its launch bonus", async () => {
    await render(<MoneyActivity read={read} period="week" onPeriod={() => {}} />);
    expect(screen.getByText(/^Paid in app \+ voucher · /)).toBeTruthy();
    expect(screen.getByText("Paid daily")).toBeTruthy();
    expect(screen.getByText("+₱14.40 launch bonus")).toBeTruthy();
    expect(screen.getByText("Paid in app")).toBeTruthy();
    expect(screen.getByText("Voucher")).toBeTruthy();
  });

  it("filters the history and switches the period", async () => {
    const onPeriod = jest.fn();
    await render(<MoneyActivity read={read} period="week" onPeriod={onPeriod} />);
    expect(screen.getByText("Shop pay earned")).toBeTruthy();
    expect(screen.getByText("Sent to your payout QR")).toBeTruthy();
    await fireEvent.press(screen.getByText("Payouts"));
    expect(screen.queryByText("Shop pay earned")).toBeNull();
    expect(screen.getByText("Sent to your payout QR")).toBeTruthy();
    await fireEvent.press(screen.getByText("Month"));
    expect(onPeriod).toHaveBeenCalledWith("month");
  });
});

describe("HowYouEarn", () => {
  it("draws three lines from GRIDGO's schedule", async () => {
    await render(<HowYouEarn schedule={SCHEDULE} />);
    expect(screen.getByText("How you earn")).toBeTruthy();
    expect(screen.getByText(/4:00 PM on business days/)).toBeTruthy();
    expect(screen.getByText(/Launch week: \+20%/)).toBeTruthy();
  });

  it("draws nothing while GRIDGO does not offer daily payouts", async () => {
    await render(<HowYouEarn schedule={null} />);
    expect(screen.queryByTestId("how-you-earn")).toBeNull();
  });
});
