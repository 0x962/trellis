import { describe, expect, test } from "bun:test";
import { changedFilePaths, type PrPath, prPaths } from "./prPaths.ts";

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

describe("pull request kind", () => {
	test("returns backend for backend paths", () => {
		expect(prPaths("trellis", [file("apps/server/src/app.ts")]).kind).toBe("backend");
	});

	test("returns frontend when every path renders the frontend", () => {
		expect(prPaths("trellis", [file("apps/web/src/routes/index.tsx"), file("packages/ui/src/Button.tsx")]).kind).toBe(
			"frontend",
		);
	});

	test("returns mixed for frontend and backend paths", () => {
		expect(prPaths("canary", [file("frontend/src/App.tsx"), file("backend/canary/hotels/selectors.py")]).kind).toBe(
			"mixed",
		);
	});

	test("returns backend as the default for an empty path list", () => {
		expect(prPaths("trellis", []).kind).toBe("backend");
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
