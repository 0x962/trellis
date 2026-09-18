import { expect, test } from "bun:test";
import { TicketSearchSchema, ticketTab } from "./ticketSearch";

test("ticket URLs retain every work area tab", () => {
	for (const tab of ["activity", "agent", "changes", "flows"] as const) {
		const search = TicketSearchSchema.parse({ tab });
		expect(ticketTab(search.tab, "")).toBe(tab);
	}
});

test("an attempt deep link opens the agent tab without a second navigation", () => {
	expect(ticketTab(undefined, "attempt-01J8R9K0H1EXQPBVA8ENR1ES35")).toBe("agent");
});

test("an explicit ticket tab takes precedence over an attempt anchor", () => {
	expect(ticketTab("changes", "attempt-01J8R9K0H1EXQPBVA8ENR1ES35")).toBe("changes");
});

test("unknown URL values use the ticket activity page", () => {
	const search = TicketSearchSchema.parse({ tab: "unknown", thread: "invalid" });
	expect(search).toEqual({ tab: undefined, thread: undefined });
	expect(ticketTab(search.tab, "")).toBe("activity");
});
