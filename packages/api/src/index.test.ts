import { expect, test } from "bun:test";
import { join } from "node:path";

// The package is imported by the server, the web app, the mobile app, and
// the CLI. A timer or a connection at import time would run in all four.
// The import runs in a child process, so every module loads fresh there. An
// earlier test file in this run cannot hide a side effect.
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

// `@tanstack/query-core` is a peer dependency for its types only. A value
// import would load it in every runtime importer of the package, and only
// the web app installs it.
test("every import of @tanstack/query-core is a type import", async () => {
	const valueImport = /^import\s+(?!type\s)[^;]*from\s+"@tanstack\/query-core"/m;
	for (const file of new Bun.Glob("**/*.ts").scanSync({ cwd: import.meta.dir })) {
		if (file.endsWith(".test.ts")) continue;
		const source = await Bun.file(join(import.meta.dir, file)).text();
		expect(valueImport.test(source), file).toBe(false);
	}
});
