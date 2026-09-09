import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pkg from "./package.json";

// The contract package is imported by every other workspace, so it carries
// only the schema and client libraries. An exact version keeps every
// workspace on one copy of zod and oRPC.
test("the package declares only the allowed dependencies and exports TypeScript source", () => {
	expect(Object.keys(pkg.dependencies).sort()).toEqual([
		"@orpc/client",
		"@orpc/contract",
		"@orpc/tanstack-query",
		"zod",
	]);
	for (const version of Object.values(pkg.dependencies)) {
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
	}
	expect(Object.keys(pkg.peerDependencies)).toContain("@tanstack/query-core");
	expect(pkg.sideEffects).toBe(false);
	const exports = pkg.exports as Record<string, string>;
	expect(Object.keys(exports).sort()).toEqual([".", "./client", "./contract", "./query-keys", "./schemas"]);
	for (const [entry, target] of Object.entries(exports)) {
		expect(target, entry).toMatch(/^\.\/src\/.*\.ts$/);
		expect(existsSync(join(import.meta.dir, target)), `${entry} -> ${target}`).toBe(true);
	}
});
