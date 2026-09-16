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

test("the glimmer adds no top edge to a card", async () => {
	const css = await Bun.file(new URL("../../ticket-glimmer.css", import.meta.url)).text();
	const rule = css.match(/\.ticket-glimmer \{([^}]*)\}/)?.[1];
	expect(rule).toBeDefined();
	expect(rule).not.toContain("box-shadow");
});
