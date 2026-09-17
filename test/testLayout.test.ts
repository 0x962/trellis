import { describe, expect, test } from "bun:test";
import { readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";

// A test that builds real infrastructure belongs under `<workspace>/test/int/`.
// `bun run test` skips that directory and `bun run test:int` runs only it, so an
// agent that runs the tests waits seconds instead of minutes.
//
// Real infrastructure means one of these, which each cost about half a second
// or more every time a file asks for one:
//   - a PGlite database (test/helpers/db.ts, or a direct openDb call)
//   - the Hono app (test/helpers/app.ts, apps/web/test/server)
//   - a local server or spawned process (Bun.serve, Bun.spawn, node:child_process)
//
// This test reads every test file, follows its relative imports, and checks that
// a file which reaches one of those sits under test/int/, and that a file which
// reaches none of them does not.

const root = resolve(import.meta.dir, "..");

// A file that opens a database, boots the app, or starts a server.
const BUILDERS = [
	"apps/server/test/helpers/db.ts",
	"apps/server/test/helpers/app.ts",
	"apps/server/test/helpers/server.ts",
	"apps/web/test/server/index.ts",
];

const STARTS_PROCESS_OR_SERVER = /Bun\.(?:spawn|serve)|spawnSync|execFileSync|node:child_process/;
// A test can also open a database without a helper, by calling the same
// function the server calls at boot.
const OPENS_DATABASE = /\bopenDb\(|\bdiskDb\(|new PGlite\b/;
const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s*)["'](\.[^"']*)["']/g;

// The file a relative specifier names. Bun resolves a bare directory to its
// index file and adds the extension, so this tries the same order.
const fileFor = (from: string, specifier: string) => {
	const base = resolve(dirname(from), specifier);
	const tries = [`${base}.ts`, `${base}.tsx`, base, join(base, "index.ts"), join(base, "index.tsx")];
	return tries.find((candidate) => statSync(candidate, { throwIfNoEntry: false })?.isFile());
};

const answers = new Map<string, boolean>();

// True when this file, or anything it imports, builds real infrastructure.
const buildsInfrastructure = (file: string, visiting: Set<string> = new Set()): boolean => {
	const cached = answers.get(file);
	if (cached !== undefined) return cached;
	if (visiting.has(file)) return false;
	visiting.add(file);

	const path = relative(root, file);
	if (BUILDERS.includes(path)) return true;

	const source = readFileSync(file, "utf8");
	if (STARTS_PROCESS_OR_SERVER.test(source) || OPENS_DATABASE.test(source)) return true;

	let answer = false;
	for (const match of source.matchAll(SPECIFIER)) {
		const imported = fileFor(file, match[1]!);
		if (imported && buildsInfrastructure(imported, visiting)) {
			answer = true;
			break;
		}
	}
	// Only a file whose answer needed no unfinished import is safe to keep. A
	// file inside a cycle gets the answer of the walk that started the cycle.
	if (visiting.size === 1) answers.set(file, answer);
	return answer;
};

// This file writes the names of the infrastructure calls to look for, so a
// search of its own source finds them and calls it an integration test. It
// skips itself.
const testFiles = [...new Bun.Glob("**/*.test.{ts,tsx}").scanSync({ cwd: root, absolute: true })].filter(
	(file) => !file.includes("/node_modules/") && !file.includes("/e2e/") && file !== import.meta.path,
);

const inIntegrationDir = (file: string) => relative(root, file).includes("test/int/");

describe("test layout", () => {
	test("the repository holds test files to check", () => {
		expect(testFiles.length).toBeGreaterThan(400);
	});

	test("every test that builds real infrastructure sits under test/int/", () => {
		const misplaced = testFiles
			.filter((file) => buildsInfrastructure(file) && !inIntegrationDir(file))
			.map((file) => relative(root, file));
		expect(misplaced).toEqual([]);
	});

	test("no test under test/int/ is free of real infrastructure", () => {
		const cheap = testFiles
			.filter((file) => inIntegrationDir(file) && !buildsInfrastructure(file))
			.map((file) => relative(root, file));
		expect(cheap).toEqual([]);
	});
});
