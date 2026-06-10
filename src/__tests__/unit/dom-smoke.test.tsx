// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";

/**
 * Toolchain smoke test (Step 34): proves the jsdom + Testing Library + jest-dom
 * stack is wired so future component tests can be added. It renders a trivial
 * inline component (no app coupling) and exercises a click + matcher.
 */
function Counter() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN((v) => v + 1)}>
      count: {n}
    </button>
  );
}

describe("component testing toolchain", () => {
  it("renders and reacts to user events", async () => {
    render(<Counter />);
    const btn = screen.getByRole("button");
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("count: 0");
    await userEvent.click(btn);
    expect(btn).toHaveTextContent("count: 1");
  });
});
