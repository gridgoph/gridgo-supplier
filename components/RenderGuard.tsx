import { Component, type ReactNode } from "react";

type Props = {
  /** Drawn in place of the children once they have thrown. */
  fallback: ReactNode;
  children: ReactNode;
};

type State = { failed: boolean };

/**
 * Keeps one part of a screen from taking the whole screen down with it.
 *
 * A render error with no boundary above it closes a release build outright, so
 * one product row the screen does not expect would cost a shop the whole tab
 * (issue report 8DC78D1F). Wrap a part that draws GRIDGO's data, give it a
 * plain fallback, and the rest of the screen stays. The fallback stays until
 * the part is mounted again with a new `key`.
 */
export class RenderGuard extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    if (__DEV__) console.warn("[render-guard] a part of this screen could not be drawn", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
