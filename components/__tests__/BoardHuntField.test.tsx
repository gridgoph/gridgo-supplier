import { act, fireEvent, render, screen } from "@testing-library/react-native";

import { BoardHuntField, HUNT_DEBOUNCE_MS } from "@/components/BoardHuntField";
import { MAX_HUNT_LENGTH } from "@/lib/catalogueBoard";

function field() {
  return screen.getByLabelText("Find a sample on your board");
}

/**
 * Find a sample.
 *
 * A print shop's board is a wall, and this is the shop walking up to it. The
 * field says so in the shop's own words, and it is the shop's own way back out
 * of a hunt that found nothing.
 */
describe("the hunt field", () => {
  it("names itself and its placeholder in the shop's own words", async () => {
    const view = await render(<BoardHuntField value="" onHunt={jest.fn()} />);

    expect(field().props.placeholder).toBe("Find a sample");
    // GRIDGO answers an error past eighty, so the line stops before it is sent.
    expect(field().props.maxLength).toBe(MAX_HUNT_LENGTH);
    expect(MAX_HUNT_LENGTH).toBe(80);
    // Nothing to clear yet, so nothing offering to.
    expect(screen.queryByLabelText("Clear")).toBeNull();
    await view.unmount();
  });

  it("offers a named control to clear the hunt, and clears it at once", async () => {
    const onHunt = jest.fn();
    const view = await render(<BoardHuntField value="tarp" onHunt={onHunt} />);

    await fireEvent.press(screen.getByLabelText("Clear"));

    // No wait: the shop asked for its whole board back, not for another hunt.
    expect(onHunt).toHaveBeenLastCalledWith("");
    expect(field().props.value).toBe("");
    await view.unmount();
  });

  /** The wall clears the hunt too — the empty-hunt copy offers exactly that. */
  it("follows the wall when the hunt is cleared somewhere else", async () => {
    const onHunt = jest.fn();
    const view = await render(<BoardHuntField value="tarp" onHunt={onHunt} />);

    expect(field().props.value).toBe("tarp");
    await view.rerender(<BoardHuntField value="" onHunt={onHunt} />);

    expect(field().props.value).toBe("");
    // Following is not asking: the wall already knows.
    expect(onHunt).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("tells the rail when it has the caret, so the filters can fold", async () => {
    const onFocusChange = jest.fn();
    const view = await render(
      <BoardHuntField value="" onHunt={jest.fn()} onFocusChange={onFocusChange} />,
    );

    await fireEvent(field(), "focus");
    expect(onFocusChange).toHaveBeenLastCalledWith(true);

    await fireEvent(field(), "blur");
    expect(onFocusChange).toHaveBeenLastCalledWith(false);
    await view.unmount();
  });
});

/**
 * The waiting, which is the part that costs GRIDGO money.
 *
 * The hunt is ranked in PostgreSQL, so a request per keystroke is a query per
 * keystroke. The field waits for the shop to stop, and the search key skips the
 * wait for a shop that has already finished.
 *
 * These run last and hold the clock for the whole block: React's scheduler
 * takes the timer functions it finds, so a file that switches regimes between
 * tests leaves later renders never committing.
 */
describe("waiting for the shop to stop typing", () => {
  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it("hunts once, after the last letter rather than after each one", async () => {
    const onHunt = jest.fn();
    const view = await render(<BoardHuntField value="" onHunt={onHunt} />);

    for (const text of ["t", "ta", "tar", "tarp"]) {
      await fireEvent.changeText(field(), text);
      await act(async () => {
        jest.advanceTimersByTime(HUNT_DEBOUNCE_MS - 50);
      });
    }
    expect(onHunt).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(HUNT_DEBOUNCE_MS);
    });
    expect(onHunt).toHaveBeenCalledTimes(1);
    expect(onHunt).toHaveBeenCalledWith("tarp");
    await view.unmount();
  });

  /** A shop that has finished typing should not wait out a timer it cannot see. */
  it("hunts at once when the shop presses the keyboard's search key", async () => {
    const onHunt = jest.fn();
    const view = await render(<BoardHuntField value="" onHunt={onHunt} />);

    await fireEvent.changeText(field(), "gold foil");
    await fireEvent(field(), "submitEditing");

    expect(onHunt).toHaveBeenCalledWith("gold foil");

    // And the wait it interrupted must not fire the same hunt a second time.
    await act(async () => {
      jest.advanceTimersByTime(HUNT_DEBOUNCE_MS * 2);
    });
    expect(onHunt).toHaveBeenCalledTimes(1);
    await view.unmount();
  });
});
