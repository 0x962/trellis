import { describe, expect, test } from "bun:test";
import type { PrPathFacts } from "../prPaths/index.ts";
import { contractFloor, evidenceFloor } from "./evidenceFloor.ts";

const clearRisk: PrPathFacts["risk"] = {
	api: "no",
	cli: "no",
	background: "no",
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

	test("returns the backend floor and accepts working and failing calls", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: clearRisk,
			hasSummary: true,
			rows: [
				{ kind: "call", record: { status: 200 } },
				{ kind: "call", record: { status: 404 } },
			],
		});

		expect(floor.required).toEqual(["summary", "callWorking", "callFailing"]);
		expect(floor.present).toEqual(floor.required);
		expect(floor.missing).toEqual([]);
	});

	test("returns both floors for a mixed pull request", () => {
		const floor = evidenceFloor({ kind: "mixed", risk: clearRisk, hasSummary: false, rows: [] });

		expect(floor.required).toEqual(["summary", "after", "before", "capture", "console", "callWorking", "callFailing"]);
		expect(floor.missing.map((gap) => gap.item)).toEqual(floor.required);
	});

	test("adds a migration plan for a schema change", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: { ...clearRisk, migration: "yes", sharedType: "yes" },
			hasSummary: false,
			rows: [],
		});

		expect(floor.required).toEqual(["summary", "callWorking", "callFailing", "migration"]);
	});

	test("keeps an equivalence proof out of the proof floor", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: { ...clearRisk, deletedTest: "yes" },
			hasSummary: false,
			rows: [],
		});

		expect(floor.required).toEqual(["summary", "callWorking", "callFailing"]);
	});

	test("returns the exact fill command for each gap", () => {
		const floor = evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, rows: [] });

		expect(floor.missing).toEqual([
			{
				item: "callWorking",
				fillCommand:
					"trellis evidence add <pr> --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>",
				soft: false,
			},
			{
				item: "callFailing",
				fillCommand:
					"trellis evidence add <pr> --kind call --method <method> --path <path> --status <code> --server <url> --request - --response <file>",
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
			required: ["summary", "callWorking", "callFailing", "migration"],
			notes: [],
		});
	});

	test("names the conditional equivalence proof for a test file", () => {
		expect(contractFloor("trellis", { files: ["apps/web/src/App.test.tsx"] })?.notes).toEqual([
			"A change that removes test cases also owes an equivalence proof.",
		]);
	});
});
