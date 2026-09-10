import { beforeEach, describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { mockMatchMedia } from "../../../../test/media";
import { SequenceHint } from "./SequenceHint";

beforeEach(() => {
	mockMatchMedia(false);
});

describe("features/command/SequenceHint", () => {
	// SQ-01. A pending sequence is never invisible, and a screen reader
	// hears it as a status.
	test("the hint shows the pending sequence as a status region", () => {
		render(<SequenceHint pending="g" />);
		const hint = screen.getByRole("status");
		expect(hint.textContent).toContain("g");
		expect(hint.className).toMatch(/\bfixed\b/);
		expect(hint.className).toMatch(/\bbottom-\d/);
		expect(hint.className).toMatch(/\bleft-\d/);
	});

	// SQ-02
	test("the hint draws nothing without a pending sequence", () => {
		const view = render(<SequenceHint pending="g" />);
		expect(view.container.innerHTML).not.toBe("");
		view.rerender(<SequenceHint pending={null} />);
		expect(view.container.innerHTML).toBe("");
		expect(screen.queryByRole("status")).toBeNull();
	});

	// SQ-03
	test("reduced motion replaces the hint slide with a fade", () => {
		mockMatchMedia(true);
		render(<SequenceHint pending="g" />);
		const hint = screen.getByRole("status");
		expect(hint.className).toContain("motion-reduce:transition-opacity");
		expect(hint.className).toContain("motion-reduce:translate-y-0");
	});
});
