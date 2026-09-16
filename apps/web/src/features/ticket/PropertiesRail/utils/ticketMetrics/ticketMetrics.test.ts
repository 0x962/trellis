import { expect, test } from "bun:test";
import { ticketMetrics } from "./ticketMetrics";

test("ticket metrics sum separate agent runs", () => {
	expect(
		ticketMetrics([{ metrics: { durationMs: 100, tokenCount: 10 } }, { metrics: { durationMs: 200, tokenCount: 20 } }]),
	).toEqual({ durationMs: 300, tokenCount: 30 });
});

test("ticket metrics distinguish no work from unavailable telemetry", () => {
	expect(ticketMetrics([])).toEqual({ durationMs: 0, tokenCount: null });
	expect(ticketMetrics([{ metrics: { durationMs: null, tokenCount: null } }])).toEqual({
		durationMs: null,
		tokenCount: null,
	});
});
