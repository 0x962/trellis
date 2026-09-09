import { expect, spyOn, test } from "bun:test";

// The package is imported by the server, the web app, the mobile app, and
// the CLI. A timer or a connection at import time would run in all four.
test("the index re-exports every public symbol with no side effect on import", async () => {
	const setTimeoutSpy = spyOn(globalThis, "setTimeout");
	const fetchSpy = spyOn(globalThis, "fetch");
	const api = await import("./index.ts");
	expect(setTimeoutSpy).not.toHaveBeenCalled();
	expect(fetchSpy).not.toHaveBeenCalled();
	setTimeoutSpy.mockRestore();
	fetchSpy.mockRestore();

	for (const name of [
		"contract",
		"errors",
		"eventNames",
		"EventSchema",
		"TicketRefSchema",
		"ProjectRefSchema",
		"StatusRefSchema",
		"ActorHeaderSchema",
		"ListQuerySchema",
		"TicketSummarySchema",
		"TicketSchema",
		"createTrellisClient",
		"createEventApplier",
		"applyEvent",
		"instructions",
	]) {
		expect(api, name).toHaveProperty(name);
		expect((api as Record<string, unknown>)[name], name).toBeDefined();
	}
});
