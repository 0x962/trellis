import { describe, expect, test } from "bun:test";
import { type PrPath, prPaths } from "./prPaths.ts";

const changed = (path: string, type: PrPath["type"] = "change"): PrPath => ({ path, type });

describe("risk answers", () => {
	test("marks an auth path", () => {
		expect(prPaths("canary", [changed("backend/canary/api/private/staff_hotels.py")]).risk.auth).toBe("yes");
	});

	test("marks a migration", () => {
		expect(prPaths("trellis", [changed("apps/server/drizzle/0083_risk.sql")]).risk.migration).toBe("yes");
	});

	test("marks a dependency manifest", () => {
		expect(prPaths("trellis", [changed("package.json")]).risk.dependency).toBe("yes");
	});

	test("marks a shared type", () => {
		expect(prPaths("trellis", [changed("packages/api/src/schemas/pullRequest.ts")]).risk.sharedType).toBe("yes");
	});

	test("marks a deleted test", () => {
		expect(prPaths("trellis", [changed("packages/api/src/time.test.ts", "deleted")]).risk.deletedTest).toBe("yes");
	});
});

describe("pull request kind", () => {
	test("returns backend for backend paths", () => {
		expect(prPaths("trellis", [changed("apps/server/src/app.ts")]).kind).toBe("backend");
	});

	test("returns frontend when every path renders the frontend", () => {
		expect(
			prPaths("trellis", [changed("apps/web/src/routes/index.tsx"), changed("packages/ui/src/Button.tsx")]).kind,
		).toBe("frontend");
	});

	test("returns mixed for frontend and backend paths", () => {
		expect(
			prPaths("canary", [changed("frontend/src/App.tsx"), changed("backend/canary/hotels/selectors.py")]).kind,
		).toBe("mixed");
	});
});

describe("path groups", () => {
	test("puts public API files and secret-like paths in risk", () => {
		const paths = [changed("src/api/public.ts"), changed("config/service-token.txt")];
		expect(prPaths("other", paths).groups).toEqual({
			"src/api/public.ts": "risk",
			"config/service-token.txt": "risk",
		});
	});

	test("puts ordinary source files in behavior", () => {
		expect(prPaths("trellis", [changed("apps/server/src/log.ts")]).groups).toEqual({
			"apps/server/src/log.ts": "behavior",
		});
	});

	test("puts test files in tests", () => {
		expect(prPaths("trellis", [changed("apps/server/src/log.test.ts")]).groups).toEqual({
			"apps/server/src/log.test.ts": "tests",
		});
	});

	test("puts generated files, lock files, and snapshots in noise", () => {
		const paths = [
			changed("apps/web/src/routeTree.gen.ts"),
			changed("bun.lock"),
			changed("src/__snapshots__/app.snap"),
		];
		expect(prPaths("trellis", paths).groups).toEqual({
			"apps/web/src/routeTree.gen.ts": "noise",
			"bun.lock": "noise",
			"src/__snapshots__/app.snap": "noise",
		});
		expect(prPaths("trellis", paths).risk.dependency).toBe("yes");
	});
});
