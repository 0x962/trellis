import { expect, test } from "bun:test";
import { agentRuns } from "./agentRuns.ts";

test("ticket metrics use the ticket metric route", () => {
	expect(agentRuns.ticketMetrics["~orpc"].route).toMatchObject({
		method: "GET",
		path: "/tickets/{ticket}/metrics",
	});
});
