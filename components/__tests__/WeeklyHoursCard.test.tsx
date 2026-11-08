import { useState } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import { WeeklyHoursCard } from "@/components/hours/WeeklyHoursCard";
import { normalizeShopHours, overridesFromDraft, weekFromDraft, type ShopHours, type WeekDraft } from "@/lib/shopHours";
import { askPick } from "@/store/sheets";

jest.mock("@/store/sheets", () => ({
  askPick: jest.fn(async () => null),
}));

const MON_SAT = [1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opensMinute: 480, closesMinute: 1080 }));
/** A Friday morning in Manila. */
const NOW = new Date("2026-10-16T10:00:00+08:00");

function hours(overrides: unknown[] = []): ShopHours {
  return normalizeShopHours({
    hours: {
      schedule: { utcOffsetMinutes: 480, week: MON_SAT, closures: [], weekdayOverrides: overrides },
      version: 3,
      temporarilyClosed: false,
      isOpenNow: true,
      calendarAvailable: true,
      nextOpeningAt: null,
      todayExtension: null,
    },
  }) as ShopHours;
}

function payload(draft: WeekDraft) {
  return { week: weekFromDraft(draft), weekdayOverrides: overridesFromDraft(draft) };
}

beforeEach(() => (askPick as jest.Mock).mockReset());

describe("WeeklyHoursCard", () => {
  it("keeps one set of hours exactly as before: every day usual, nothing to save", async () => {
    await render(<WeeklyHoursCard hours={hours()} now={NOW} saving={false} onSave={jest.fn()} />);
    expect(screen.queryByText(/not available yet/)).toBeNull();
    for (const day of ["Monday", "Saturday"]) {
      expect(screen.getByLabelText(`${day}, different hours`).props.accessibilityState.checked).toBe(false);
    }
    expect(screen.getAllByText("8:00 AM–6:00 PM")).toHaveLength(6);
    expect(screen.queryByText("Save weekly hours")).toBeNull();
    expect(screen.queryByLabelText(/Saturday opening time/)).toBeNull();
  });

  it("gives Saturday its own hours and saves the base week with one override", async () => {
    const onSave = jest.fn(async () => null);
    (askPick as jest.Mock).mockResolvedValueOnce("420").mockResolvedValueOnce("900");
    await render(<WeeklyHoursCard hours={hours()} now={NOW} saving={false} onSave={onSave} />);

    await act(async () => fireEvent.press(screen.getByLabelText("Saturday, different hours")));
    expect(screen.getByLabelText("Saturday, different hours").props.accessibilityState.checked).toBe(true);
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday opening time, 8:00 AM")));
    expect(askPick).toHaveBeenLastCalledWith(expect.objectContaining({ title: "Saturday opens", body: "Saturday only." }));
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday closing time, 6:00 PM")));
    expect(screen.getByText("7:00 AM–3:00 PM")).toBeTruthy();

    await act(async () => fireEvent.press(screen.getByText("Save weekly hours")));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(payload((onSave.mock.calls[0] as unknown as [WeekDraft])[0])).toEqual({
      week: MON_SAT,
      weekdayOverrides: [{ weekday: 6, opensMinute: 420, closesMinute: 900 }],
    });
    await waitFor(() => expect(screen.getByText(/Weekly hours saved/)).toBeTruthy());
  });

  it("reads a saved short Saturday and puts it back on the usual hours", async () => {
    const onSave = jest.fn(async () => null);
    await render(
      <WeeklyHoursCard
        hours={hours([{ weekday: 6, opensMinute: 420, closesMinute: 900 }])}
        now={NOW}
        saving={false}
        onSave={onSave}
      />,
    );
    expect(screen.getByLabelText("Saturday, different hours").props.accessibilityState.checked).toBe(true);
    expect(screen.getByText("7:00 AM–3:00 PM")).toBeTruthy();
    expect(screen.queryByText("Save weekly hours")).toBeNull();

    await act(async () => fireEvent.press(screen.getByLabelText("Saturday, different hours")));
    await act(async () => fireEvent.press(screen.getByText("Save weekly hours")));
    expect(payload((onSave.mock.calls[0] as unknown as [WeekDraft])[0]).weekdayOverrides).toEqual([]);
  });

  it("locks every time field while a save is in flight, so a later edit cannot be lost", async () => {
    let finish: (refusal: string | null) => void = () => undefined;
    const onSave = jest.fn((_draft: WeekDraft) => new Promise<string | null>((resolve) => (finish = resolve)));
    // The screen's store flips `saving` for the life of the request; this does the same.
    function Harness() {
      const [saving, setSaving] = useState(false);
      return (
        <WeeklyHoursCard
          hours={hours()}
          now={NOW}
          saving={saving}
          onSave={async (draft) => {
            setSaving(true);
            try {
              return await onSave(draft);
            } finally {
              setSaving(false);
            }
          }}
        />
      );
    }
    (askPick as jest.Mock).mockResolvedValueOnce("900");
    await render(<Harness />);
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday, different hours")));
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday closing time, 6:00 PM")));
    await act(async () => fireEvent.press(screen.getByText("Save weekly hours")));
    expect(screen.getByText("Saving…")).toBeTruthy();

    for (const label of [
      "Saturday opening time, 8:00 AM",
      "Saturday closing time, 3:00 PM",
      "Usual opening time, 8:00 AM",
      "Usual closing time, 6:00 PM",
    ]) {
      const field = screen.getByLabelText(label);
      expect(field.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      await act(async () => fireEvent.press(field));
    }
    expect(askPick).toHaveBeenCalledTimes(1);

    await act(async () => finish(null));
    await waitFor(() => expect(screen.getByText(/Weekly hours saved/)).toBeTruthy());
    // Unlocked again once the answer is in.
    expect(screen.getByLabelText("Usual opening time, 8:00 AM").props.accessibilityState).toEqual(
      expect.objectContaining({ disabled: false }),
    );
  });

  it("says a day's problem beside that day, before sending", async () => {
    const onSave = jest.fn(async () => null);
    (askPick as jest.Mock).mockResolvedValueOnce("420");
    await render(<WeeklyHoursCard hours={hours()} now={NOW} saving={false} onSave={onSave} />);
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday, different hours")));
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday closing time, 6:00 PM")));
    await act(async () => fireEvent.press(screen.getByText("Save weekly hours")));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Pick a Saturday closing time later than its opening time.")).toBeTruthy();
  });

  it("shows GRIDGO's refusal in plain words beside the day that changed", async () => {
    const refusal = "GRIDGO could not use those hours. Each day needs a closing time later than its opening time.";
    const onSave = jest.fn(async () => refusal);
    (askPick as jest.Mock).mockResolvedValueOnce("900");
    const { toJSON } = await render(<WeeklyHoursCard hours={hours()} now={NOW} saving={false} onSave={onSave} />);
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday, different hours")));
    await act(async () => fireEvent.press(screen.getByLabelText("Saturday closing time, 6:00 PM")));
    await act(async () => fireEvent.press(screen.getByText("Save weekly hours")));
    expect(screen.getByText(refusal)).toBeTruthy();
    // It sits after Saturday's fields and before the save button.
    const text = JSON.stringify(toJSON());
    expect(text.indexOf(refusal)).toBeGreaterThan(text.indexOf("Saturday closing time"));
    expect(text.indexOf(refusal)).toBeLessThan(text.indexOf("Save weekly hours"));
    expect(text.indexOf(refusal)).toBeGreaterThan(text.indexOf("Friday, different hours"));
  });
});
