import { expect, test } from "bun:test";
import { join } from "node:path";
import pkg from "../package.json";

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
	expect(JSON.parse(child.stdout.toString())).toMatchObject({ timers: 0, fetches: 0 });

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

// The server, the mobile app, and the CLI import the package at runtime and
// install only its `dependencies`. So every package a module under src/
// imports by value is a declared dependency.
test("every value import under src/ names a declared dependency", async () => {
	const valueImport = /^import\s+(?!type\s)[^;]*from\s+"((?:@[^/"]+\/)?[^./"][^/"]*)/gm;
	for (const file of new Bun.Glob("**/*.ts").scanSync({ cwd: import.meta.dir })) {
		if (file.endsWith(".test.ts")) continue;
		const source = await Bun.file(join(import.meta.dir, file)).text();
		for (const match of source.matchAll(valueImport)) {
			const name = match[1]!;
			expect(Object.keys(pkg.dependencies), `${file} imports ${name}`).toContain(name);
		}
	}
});

// `@orpc/tanstack-query` imports `@tanstack/query-core` by value, so the
// import of the index loads it in every runtime importer.
test("the index loads @tanstack/query-core at runtime, so the package declares it as a dependency", () => {
	const child = Bun.spawnSync({
		cmd: [process.execPath, join(import.meta.dir, "..", "test", "importSideEffects.ts")],
		stdout: "pipe",
	});
	const { packages } = JSON.parse(child.stdout.toString()) as { packages: string[] };
	expect(packages).toContain("@tanstack/query-core");
	expect(Object.keys(pkg.dependencies)).toContain("@tanstack/query-core");
});
