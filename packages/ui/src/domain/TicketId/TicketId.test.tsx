import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import { expectClasses } from "../../../test/classes";
import { TicketId } from "./TicketId";

describe("TicketId", () => {
	test("renders the identifier in muted tabular mono", () => {
		render(
			<>
				<TicketId id="CDE-43" />
				<TicketId id="TRL-9" size="sm" />
			</>,
		);
		const full = screen.getByText("CDE-43");
		expectClasses(full, "font-mono text-fg-muted tabular text-sm");
		const small = screen.getByText("TRL-9");
		expectClasses(small, "font-mono text-fg-muted tabular text-xs");
		expect(small.classList.contains("text-sm")).toBe(false);
	});
});
