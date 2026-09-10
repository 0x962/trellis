import { expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import pkg from "./package.json";

// The contract package is imported by every other workspace, so it carries
// only the schema, client, and query cache libraries. An exact version
// keeps every workspace on one copy of zod, oRPC, and query-core.
test("the package declares only the allowed dependencies and exports TypeScript source", () => {
	expect(Object.keys(pkg.dependencies).sort()).toEqual([
		"@orpc/client",
		"@orpc/contract",
		"@orpc/tanstack-query",
		"@tanstack/query-core",
		"zod",
	]);
	for (const version of Object.values(pkg.dependencies)) {
		expect(version).toMatch(/^\d+\.\d+\.\d+$/);
	}
	expect(pkg.sideEffects).toBe(false);
	const exports = pkg.exports as Record<string, string>;
	expect(Object.keys(exports).sort()).toEqual([".", "./client", "./contract", "./query-keys", "./schemas"]);
	for (const [entry, target] of Object.entries(exports)) {
		expect(target, entry).toMatch(/^\.\/src\/.*\.ts$/);
		expect(existsSync(join(import.meta.dir, target)), `${entry} -> ${target}`).toBe(true);
	}
});

// A dependency's own peer dependency is not installed for it. An importer
// that installs only this package's `dependencies` must get every peer a
// dependency requires, so each one is declared here too.
//
// `Bun.resolveSync` finds the manifest the way an import from this directory
// finds the package itself. The install puts a package either in
// `packages/api/node_modules` or in the root `node_modules`, and the search
// walks up through both.
test("every peer dependency a declared dependency requires is a declared dependency", async () => {
	for (const name of Object.keys(pkg.dependencies)) {
		const manifest = (await Bun.file(Bun.resolveSync(`${name}/package.json`, import.meta.dir)).json()) as {
			peerDependencies?: Record<string, string>;
			peerDependenciesMeta?: Record<string, { optional?: boolean }>;
		};
		for (const peer of Object.keys(manifest.peerDependencies ?? {})) {
			if (manifest.peerDependenciesMeta?.[peer]?.optional === true) continue;
			expect(Object.keys(pkg.dependencies), `${name} requires ${peer}`).toContain(peer);
		}
	}
});
