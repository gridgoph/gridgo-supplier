import { fireEvent, render, screen } from "@testing-library/react-native";

import { QueueCalendar } from "@/components/QueueCalendar";
import type { Order, SupplierService } from "@/lib/api";
import { monthGrid } from "@/lib/queueCalendar";

const service = (capacityDaily: number | null): SupplierService =>
  ({ id: "svc", state: "live", capacityDaily, capacityWeekly: null } as unknown as SupplierService);

const job = (promisedDate: string, quantity: number): Order =>
  ({ id: `job_${promisedDate}_${quantity}`, promisedDate, quantity } as unknown as Order);

const MARCH = new Date(2026, 2, 9);
const NOW = new Date(2026, 2, 9, 12, 59, 30);

async function renderMonth(opts?: { placeLabel?: string | null; selectedDayKey?: string | null }) {
  const onSelectDay = jest.fn();
  const onChangeMonth = jest.fn();
  const days = monthGrid({
    month: MARCH,
    jobs: [job("2026-03-10", 200), job("2026-03-11", 500)],
    services: [service(500)],
    now: NOW,
  });

  const view = await render(
    <QueueCalendar
      days={days}
      month={MARCH}
      selectedDayKey={opts?.selectedDayKey ?? "2026-03-09"}
      placeLabel={opts?.placeLabel}
      onSelectDay={onSelectDay}
      onChangeMonth={onChangeMonth}
    />,
  );

  return { view, onSelectDay, onChangeMonth };
}

describe("QueueCalendar", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
    jest.useRealTimers();
  });

  it("leads with the selected day, the month, and the weekday letters", async () => {
    view = (await renderMonth()).view;

    expect(screen.getByText("09")).toBeTruthy();
    expect(screen.getByText("MARCH")).toBeTruthy();
    expect(screen.getByText("2026")).toBeTruthy();
    expect(screen.getByText("Mon")).toBeTruthy();
    expect(screen.getByLabelText("Monday 9 MARCH 2026")).toBeTruthy();
  });

  it("writes the shop's own clock, and a place only when the shop has one", async () => {
    view = (await renderMonth({ placeLabel: "12 Claveria St, Davao City" })).view;

    expect(screen.getByText(/12:59:30/)).toBeTruthy();
    expect(screen.getByText(/Davao City/)).toBeTruthy();
  });

  it("does not invent a city when the shop has never given one", async () => {
    view = (await renderMonth({ placeLabel: null })).view;

    expect(screen.getByText(/12:59:30/)).toBeTruthy();
    expect(screen.queryByText(/Davao/)).toBeNull();
  });

  it("keeps month navigation and a selected day readable without colour", async () => {
    const rendered = await renderMonth();
    view = rendered.view;

    await fireEvent.press(screen.getByLabelText("Next month"));
    expect(rendered.onChangeMonth).toHaveBeenCalledWith(new Date(2026, 3, 1));

    const selected = screen.getByLabelText("9: Open. Nothing booked");
    expect(selected.props.accessibilityState).toEqual(
      expect.objectContaining({ selected: true, disabled: false }),
    );
  });

  it("fills a working day from the bottom, as a liquid, not a sweep", async () => {
    view = (await renderMonth()).view;

    const liquid = screen.getByTestId("day-liquid-10");
    const style = Array.isArray(liquid.props.style)
      ? Object.assign({}, ...liquid.props.style)
      : liquid.props.style;

    // 40px disc, 1.5px pale outline, 40% of the shop's 500-unit day.
    expect(style.height).toBeCloseTo((40 - 3) * 0.4);
    expect(style.width).toBe("100%");
    expect(style.transform).toBeUndefined();
    expect(screen.queryByTestId("day-liquid-11")).toBeNull();
    expect(screen.queryByTestId("day-liquid-9")).toBeNull();
  });

  it("leaves neighbouring-month padding untappable", async () => {
    view = (await renderMonth()).view;

    // 23 February leads the grid; 23 March is a real Monday. Same numeral,
    // only the padding cell is disabled.
    const cells = screen.getAllByLabelText(/23: Open. Nothing booked/);
    expect(cells.some((cell) => cell.props.accessibilityState?.disabled)).toBe(true);
    expect(cells.some((cell) => !cell.props.accessibilityState?.disabled)).toBe(true);
  });
});
