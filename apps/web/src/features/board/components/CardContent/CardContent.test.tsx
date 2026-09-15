import { describe, expect, test } from "bun:test";
import { render, screen } from "@testing-library/react";
import type { TicketSummary } from "@trellis/api";
import { ticketSummary as rawSummary } from "../../../../../test/fixtures";

const ticketSummary = (overrides: Record<string, unknown> = {}) => rawSummary(overrides) as unknown as TicketSummary;

import { CardContent } from "./CardContent";

describe("CardContent", () => {
	test("the trail names every ticket above this one, then the ticket", () => {
		render(<CardContent ticket={ticketSummary({ identifier: "OP-9", ancestors: ["OP-4", "OP-6"] })} />);
		expect(screen.getByText("OP-4")).toBeDefined();
		expect(screen.getByText("OP-6")).toBeDefined();
		expect(screen.getByText("OP-9")).toBeDefined();
	});

	test("the card carries no pull request, no checks, and no time", () => {
		render(
			<CardContent
				ticket={ticketSummary({
					lastActor: {
						name: "01M2HGY58VB4J2AYRVGDFHHB3P",
						displayName: "Kenji",
						kind: "agent",
						at: "2026-09-10T20:00:00.000Z",
					},
					pr: { state: "open", ciState: "fail", pass: 1, fail: 2, pending: 0 },
				})}
			/>,
		);
		expect(screen.queryByLabelText(/PR$/)).toBeNull();
		expect(screen.queryByLabelText("Checks")).toBeNull();
		expect(screen.queryByText(/^\d+[smhdw]$/)).toBeNull();
		// The actor keeps the end of the meta row, with no words beside it.
		expect(screen.getByRole("img", { name: "Kenji · agent" })).toBeDefined();
	});
});
