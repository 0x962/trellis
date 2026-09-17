import { expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { TicketGlimmer } from "./TicketGlimmer";

test("only active work has a glimmer and an accessible work label", () => {
	const { container, rerender } = render(<TicketGlimmer active={false} />);
	expect(container.firstChild).toBeNull();
	rerender(<TicketGlimmer active />);
	expect(screen.getByText("Agent working")).toBeDefined();
	expect(container.querySelector(".ticket-glimmer")).not.toBeNull();
	rerender(<TicketGlimmer active={false} />);
	expect(container.firstChild).toBeNull();
});
