import { fireEvent, render, screen } from "@testing-library/react-native";

import { AlertCard } from "@/components/AlertCard";
import type { Notification } from "@/lib/api";

function alert(partial: Partial<Notification> = {}): Notification {
  return {
    id: "ntf_1",
    userId: "user_supplier",
    orderId: "ord_1",
    title: "Printing evidence still owed",
    body: "GRIDGO is holding half of what you earn on this job.",
    read: false,
    at: "2026-08-10T12:05:00.000Z",
    ...partial,
  };
}

type RenderedNode = { type?: unknown } | null;

/** The outermost rendered element — the swipeable wrapper, or what replaced it. */
function rootType(tree: RenderedNode | RenderedNode[]): unknown[] {
  return Array.isArray(tree) ? tree.map((node) => node?.type) : [tree?.type];
}

describe("AlertCard", () => {
  /**
   * The regression this pins, observed as a hang on a real device: only unread
   * cards used to be wrapped in a swipeable, so marking one read from inside
   * its own open callback re-rendered it into the unwrapped branch and tore the
   * gesture handler out of the tree mid-animation. Both states must produce the
   * same wrapper — a read card simply offers no action inside it.
   */
  it("wraps read and unread alike, so marking one read cannot unmount the gesture", async () => {
    const unreadTree = (await render(
      <AlertCard alert={alert()} unread stageIndex={1} onMarkRead={jest.fn()} />,
    )).toJSON();
    const readTree = (await render(
      <AlertCard alert={alert()} unread={false} stageIndex={1} onMarkRead={jest.fn()} />,
    )).toJSON();

    expect(rootType(readTree)).toEqual(rootType(unreadTree));
  });

  it("marks read and opens the job on a tap", async () => {
    const onMarkRead = jest.fn();
    const onOpen = jest.fn();
    await render(
      <AlertCard
        alert={alert()}
        unread
        stageIndex={1}
        onMarkRead={onMarkRead}
        onOpen={onOpen}
      />,
    );
    fireEvent.press(screen.getByRole("button", { name: /Printing evidence still owed/ }));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it("says it is unread to a screen reader, not only with a dot", async () => {
    await render(<AlertCard alert={alert()} unread stageIndex={1} onMarkRead={jest.fn()} />);
    expect(screen.getByRole("button", { name: /^Unread\./ })).toBeTruthy();
  });

  it("drops that from one that has been read", async () => {
    await render(<AlertCard alert={alert()} unread={false} stageIndex={1} onMarkRead={jest.fn()} />);
    expect(screen.queryByRole("button", { name: /^Unread\./ })).toBeNull();
  });

  it("shows the day as well as the time", async () => {
    await render(<AlertCard alert={alert()} unread stageIndex={1} onMarkRead={jest.fn()} />);
    expect(screen.getByText(/Aug 10, 2026/)).toBeTruthy();
  });

  /** An accreditation decision has no job stage and must not be given one. */
  it("draws no stage track when the alert is not about a job", async () => {
    await render(
      <AlertCard
        alert={alert({ orderId: undefined })}
        unread
        stageIndex={-1}
        onMarkRead={jest.fn()}
      />,
    );
    expect(screen.queryByRole("progressbar")).toBeNull();
  });

  it("draws the job's stage when there is one", async () => {
    await render(<AlertCard alert={alert()} unread stageIndex={2} onMarkRead={jest.fn()} />);
    expect(screen.getByRole("progressbar", { name: /Pickup/ })).toBeTruthy();
  });

  /**
   * The track is one element to a screen reader, so where the job stands has
   * to be in words in its label — colour and a filled dot are not enough on
   * their own, and the labels under the icons are inside the container.
   */
  it("says where the job stands in words, not only by which dots are filled", async () => {
    await render(<AlertCard alert={alert()} unread stageIndex={1} onMarkRead={jest.fn()} />);
    const track = screen.getByRole("progressbar");
    expect(track.props.accessibilityLabel).toBe("Job stage 2 of 4, Printing");
    expect(track.props.accessibilityValue).toEqual({ min: 1, max: 4, now: 2 });
  });
});
