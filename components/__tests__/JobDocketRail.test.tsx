import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

jest.mock("@/store/sheets", () => ({
  askPick: jest.fn(async () => null),
}));

import { JobDocketRail } from "@/components/JobDocketRail";
import { DEFAULT_JOB_BOARD_QUERY } from "@/lib/jobBoard";
import { askPick } from "@/store/sheets";

const COUNTS = {
  all: 3,
  late: 1,
  on_press: 1,
  packed: 0,
  with_rider: 0,
  waiting_on_client: 1,
};

describe("Jobs docket rail", () => {
  let view: Awaited<ReturnType<typeof render>> | undefined;

  beforeEach(() => {
    jest.clearAllMocks();
    (askPick as jest.Mock).mockResolvedValue(null);
  });

  afterEach(async () => {
    await view?.unmount();
    view = undefined;
  });

  it("names the current order next to the count, the way the client list does", async () => {
    view = await render(
      <JobDocketRail
        query={DEFAULT_JOB_BOARD_QUERY}
        counts={COUNTS}
        shown={3}
        total={3}
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByText("3 jobs")).toBeTruthy();
    expect(screen.getByText("Due date first")).toBeTruthy();
    expect(
      screen.getByLabelText("Sort: due date first. Change the order."),
    ).toBeTruthy();
    expect(screen.queryByText("SORT")).toBeNull();
    expect(screen.queryByText("Late first")).toBeNull();
  });

  it("opens the sort sheet and applies the chosen order", async () => {
    (askPick as jest.Mock).mockResolvedValue("newest");
    const onChange = jest.fn();
    view = await render(
      <JobDocketRail
        query={DEFAULT_JOB_BOARD_QUERY}
        counts={COUNTS}
        shown={2}
        total={3}
        onChange={onChange}
      />,
    );

    expect(screen.getByText("2 of 3 jobs")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText("Sort: due date first. Change the order."));

    await waitFor(() => {
      expect(askPick).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Sort jobs",
          selected: "due_first",
        }),
      );
      expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_JOB_BOARD_QUERY, sort: "newest" });
    });
  });
});
