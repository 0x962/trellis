import { expect, test } from "bun:test";
import { join } from "node:path";

// The package is imported by the server, the web app, the mobile app, and
// the CLI. A timer or a connection at import time would run in all four.
// The import runs in a child process, so every module loads fresh there and
// an earlier test file in this run cannot hide a side effect.
test("the index re-exports every public symbol with no side effect on import", async () => {
	const child = Bun.spawnSync({
		cmd: [process.execPath, join(import.meta.dir, "..", "test", "importSideEffects.ts")],
		stdout: "pipe",
		stderr: "pipe",
	});
	expect(child.stderr.toString()).toBe("");
	expect(child.exitCode).toBe(0);
	expect(JSON.parse(child.stdout.toString())).toEqual({ timers: 0, fetches: 0 });

	const api = await import("./index.ts");
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
