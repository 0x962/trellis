import { describe, expect, test } from "bun:test";
import { changedFilePaths, changesDataModels, hasMermaidErDiagram, type PrPath, prPaths } from "./prPaths.ts";

const file = (path: string, change: PrPath["change"] = "change"): PrPath => ({
	path,
	change,
	removedLinesOnly: false,
});

describe("risk answers", () => {
	test("marks a test file that only loses lines as a deleted-test risk", () => {
		const paths = changedFilePaths([
			{ path: "packages/api/src/time.test.ts", change: "change", additions: 0, deletions: 4 },
		]);

		expect(prPaths("trellis", paths).risk.deletedTest).toBe("yes");
		expect(paths[0]?.change).toBe("change");
	});

	test("marks an auth path", () => {
		expect(prPaths("canary", [file("backend/canary/api/private/staff_hotels.py")]).risk.auth).toBe("yes");
	});

	test("marks a migration", () => {
		expect(prPaths("trellis", [file("apps/server/drizzle/0083_risk.sql")]).risk.migration).toBe("yes");
	});

	test("marks a dependency manifest", () => {
		expect(prPaths("trellis", [file("package.json")]).risk.dependency).toBe("yes");
	});

	test("marks a shared type", () => {
		expect(prPaths("trellis", [file("packages/api/src/schemas/pullRequest.ts")]).risk.sharedType).toBe("yes");
	});

	test("marks a deleted test", () => {
		expect(prPaths("trellis", [file("packages/api/src/time.test.ts", "deleted")]).risk.deletedTest).toBe("yes");
	});

	test("does not mark a test file as a shared type", () => {
		expect(prPaths("trellis", [file("packages/api/src/time.test.ts")]).risk.sharedType).toBe("no");
	});
});

describe("path groups", () => {
	test("puts public API files and secret-like paths in risk", () => {
		const paths = [file("src/api/public.ts"), file("config/service-token.txt")];
		expect(prPaths("other", paths).groups).toEqual({
			"src/api/public.ts": "risk",
			"config/service-token.txt": "risk",
		});
	});

	test("puts ordinary source files in behavior", () => {
		expect(prPaths("trellis", [file("apps/server/src/log.ts")]).groups).toEqual({
			"apps/server/src/log.ts": "behavior",
		});
	});

	test("puts test files in tests", () => {
		expect(prPaths("trellis", [file("apps/server/src/log.test.ts")]).groups).toEqual({
			"apps/server/src/log.test.ts": "tests",
		});
	});

	test("puts a test file inside an API directory in tests", () => {
		expect(prPaths("other", [file("src/api/client.test.ts")]).groups).toEqual({
			"src/api/client.test.ts": "tests",
		});
	});

	test("puts generated files, lock files, and snapshots in noise", () => {
		const paths = [file("apps/web/src/routeTree.gen.ts"), file("bun.lock"), file("src/__snapshots__/app.snap")];
		expect(prPaths("trellis", paths).groups).toEqual({
			"apps/web/src/routeTree.gen.ts": "noise",
			"bun.lock": "noise",
			"src/__snapshots__/app.snap": "noise",
		});
		expect(prPaths("trellis", paths).risk.dependency).toBe("yes");
	});
});

describe("data model changes", () => {
	test.each([
		["Django migration", "backend/operator/migrations/0004_briefing.py"],
		["Django models.py", "backend/operator/models.py"],
		["Django models folder", "backend/operator/models/briefing.py"],
		["Drizzle migration", "apps/server/drizzle/0091_briefings.sql"],
		["Drizzle table", "apps/server/src/db/tables/briefings.ts"],
		["Prisma schema", "services/api/schema.prisma"],
		["plain SQL migration", "db/migrations/202609221628_add_briefings.sql"],
	])("marks a %s as a data model change", (_name, path) => {
		expect(changesDataModels([file(path)])).toBe(true);
	});

	test("ignores an ordinary source path", () => {
		expect(changesDataModels([file("apps/server/src/services/brief.ts")])).toBe(false);
	});
});

describe("mermaid ER diagrams", () => {
	test("finds an erDiagram inside a mermaid block", () => {
		expect(hasMermaidErDiagram(["Before\n```mermaid\nerDiagram\n  TICKET ||--o{ PR : links\n```\nAfter"])).toBe(true);
	});

	test("ignores other mermaid diagrams and unfenced erDiagram text", () => {
		expect(hasMermaidErDiagram(["```mermaid\nflowchart LR\n  a --> b\n```", "erDiagram"])).toBe(false);
	});
});

describe("per-path reasons", () => {
	test("names every rule one path matches, strongest first", () => {
		const paths = [file("backend/canary/api/private/auth/tokens.py")];

		expect(prPaths("canary", paths).reasons["backend/canary/api/private/auth/tokens.py"]).toEqual([
			"secret",
			"auth",
			"publicApi",
		]);
	});

	test("gives a path that matches no rule an empty list", () => {
		expect(prPaths("trellis", [file("apps/web/src/lib/theme.ts")]).reasons["apps/web/src/lib/theme.ts"]).toEqual([]);
	});

	test("names a deleted test", () => {
		const paths = changedFilePaths([
			{ path: "packages/api/src/time.test.ts", change: "deleted", additions: 0, deletions: 4 },
		]);

		expect(prPaths("trellis", paths).reasons["packages/api/src/time.test.ts"]).toEqual(["deletedTest"]);
	});

	test("gives a reason list to every path it was given", () => {
		const paths = [file("bun.lock"), file("apps/server/drizzle/0091_briefings.sql")];

		expect(Object.keys(prPaths("trellis", paths).reasons)).toEqual([
			"bun.lock",
			"apps/server/drizzle/0091_briefings.sql",
		]);
	});
});
