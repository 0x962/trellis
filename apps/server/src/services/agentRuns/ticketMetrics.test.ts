import { expect, test } from "bun:test";
import { aggregateTicketMetrics } from "./ticketMetrics.ts";

test("ticket metrics sum run work and keep missing usage unavailable", () => {
	expect(
		aggregateTicketMetrics(
			[
				{ durationMs: 100, tokenCount: 10 },
				{ durationMs: 200, tokenCount: 20 },
			],
			400,
		),
	).toEqual({ durationMs: 300, tokenCount: 30, ageMs: 400 });
	expect(aggregateTicketMetrics([{ durationMs: null, tokenCount: null }], 400)).toEqual({
		durationMs: null,
		tokenCount: null,
		ageMs: 400,
	});
});

test("a ticket without runs has no recorded tokens and zero process time", () => {
	expect(aggregateTicketMetrics([], 400)).toEqual({ durationMs: 0, tokenCount: null, ageMs: 400 });
});
