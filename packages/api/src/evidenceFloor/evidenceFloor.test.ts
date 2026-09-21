import { describe, expect, test } from "bun:test";
import type { PrPathFacts } from "../prPaths/index.ts";
import { contractFloor, evidenceFloor } from "./evidenceFloor.ts";

const clearRisk: PrPathFacts["risk"] = {
	auth: "no",
	migration: "no",
	dependency: "no",
	sharedType: "no",
	deletedTest: "no",
};

describe("evidenceFloor", () => {
	test("requires a capture record apart from the before image", () => {
		const floor = evidenceFloor({
			kind: "frontend",
			risk: clearRisk,
			hasSummary: true,
			rows: [{ kind: "after" }, { kind: "before" }, { kind: "console" }],
		});

		expect(floor.required).toEqual(["summary", "after", "before", "capture", "console"]);
		expect(floor.present).toEqual(["summary", "after", "before", "console"]);
		expect(floor.missing).toEqual([
			{
				item: "capture",
				fillCommand:
					'trellis evidence add <pr> --kind capture --base <base> --route <route> --viewport 1440x900 --theme dark --seed "<command>" --browser <browser> --time <time>',
				soft: false,
			},
		]);

		const complete = evidenceFloor({
			kind: "frontend",
			risk: clearRisk,
			hasSummary: true,
			rows: [{ kind: "after" }, { kind: "before" }, { kind: "capture" }, { kind: "console" }],
		});
		expect(complete.present).toEqual(complete.required);
	});

	test("returns the backend floor and accepts a test none record", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: clearRisk,
			hasSummary: true,
			rows: [{ kind: "verify" }, { kind: "test" }, { kind: "contract" }],
		});

		expect(floor.required).toEqual(["summary", "verify", "test", "contract"]);
		expect(floor.present).toEqual(floor.required);
		expect(floor.missing).toEqual([]);
	});

	test("returns both floors for a mixed pull request", () => {
		const floor = evidenceFloor({ kind: "mixed", risk: clearRisk, hasSummary: false, rows: [] });

		expect(floor.required).toEqual(["summary", "after", "before", "capture", "console", "verify", "test", "contract"]);
		expect(floor.missing.map((gap) => gap.item)).toEqual(floor.required);
	});

	test("adds a migration plan and one picture for a schema change", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: { ...clearRisk, migration: "yes", sharedType: "yes" },
			hasSummary: false,
			rows: [],
		});

		expect(floor.required).toEqual(["summary", "verify", "test", "contract", "migration", "picture"]);
		expect(floor.missing.at(-1)).toMatchObject({ item: "picture", soft: true });
	});

	test("adds one picture for auth or dependency risk", () => {
		for (const risk of [
			{ ...clearRisk, auth: "yes" as const },
			{ ...clearRisk, dependency: "yes" as const },
		]) {
			const floor = evidenceFloor({ kind: "backend", risk, hasSummary: false, rows: [] });
			expect(floor.required.at(-1)).toBe("picture");
		}
	});

	test("adds equivalence proof for a deleted test", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: { ...clearRisk, deletedTest: "yes" },
			hasSummary: false,
			rows: [],
		});

		expect(floor.required.at(-1)).toBe("equivalence");
	});

	test("returns the exact fill command for each gap", () => {
		const floor = evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, rows: [] });

		expect(floor.missing).toEqual([
			{
				item: "verify",
				fillCommand: 'trellis evidence add <pr> --kind verify --cmd "<command>" --exit <code> --sha <head> --tail -',
				soft: false,
			},
			{
				item: "test",
				fillCommand: "trellis evidence add <pr> --kind test --name <test> --fails-on <base> --passes-on <head>",
				soft: false,
			},
			{
				item: "contract",
				fillCommand: 'trellis evidence add <pr> --kind contract --before "<before>" --after "<after>"',
				soft: false,
			},
		]);
	});
});

describe("contractFloor", () => {
	test("returns unknown without one repository or one file", () => {
		expect(contractFloor(undefined, { files: ["apps/server/src/services/brief.ts"] })).toBeNull();
		expect(contractFloor("trellis", { files: [] })).toBeNull();
	});

	test("forecasts a migration for a server database path", () => {
		expect(contractFloor("trellis", { files: ["apps/server/src/db/schema.ts"] })).toEqual({
			kind: "backend",
			required: ["summary", "verify", "test", "contract", "migration", "picture"],
			notes: [],
		});
	});

	test("names the conditional equivalence proof for a test file", () => {
		expect(contractFloor("trellis", { files: ["apps/web/src/App.test.tsx"] })?.notes).toEqual([
			"A change that removes test cases also owes an equivalence proof.",
		]);
	});
});
