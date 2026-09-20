import { describe, expect, test } from "bun:test";
import type { PrPathFacts } from "../prPaths/index.ts";
import { evidenceFloor } from "./evidenceFloor.ts";

const clearRisk: PrPathFacts["risk"] = {
	auth: "no",
	migration: "no",
	dependency: "no",
	sharedType: "no",
	deletedTest: "no",
};

describe("evidenceFloor", () => {
	test("returns the frontend floor and counts the before capture record", () => {
		const floor = evidenceFloor({
			kind: "frontend",
			risk: clearRisk,
			hasSummary: true,
			records: [{ kind: "after" }, { kind: "before" }, { kind: "console" }],
		});

		expect(floor.required).toEqual(["summary", "after", "before", "capture", "console"]);
		expect(floor.present).toEqual(floor.required);
		expect(floor.missing).toEqual([]);
	});

	test("returns the backend floor and accepts a test none record", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: clearRisk,
			hasSummary: true,
			records: [{ kind: "verify" }, { kind: "test" }, { kind: "contract" }],
		});

		expect(floor.required).toEqual(["summary", "verify", "test", "contract"]);
		expect(floor.present).toEqual(floor.required);
		expect(floor.missing).toEqual([]);
	});

	test("returns both floors for a mixed pull request", () => {
		const floor = evidenceFloor({ kind: "mixed", risk: clearRisk, hasSummary: false, records: [] });

		expect(floor.required).toEqual(["summary", "after", "before", "capture", "console", "verify", "test", "contract"]);
		expect(floor.missing.map((gap) => gap.item)).toEqual(floor.required);
	});

	test("treats an unknown kind as backend", () => {
		const floor = evidenceFloor({ kind: null, risk: null, hasSummary: false, records: [] });

		expect(floor.kind).toBe("backend");
		expect(floor.assumedBackend).toBe(true);
		expect(floor.required).toEqual(["summary", "verify", "test", "contract"]);
	});

	test("adds a migration plan and one picture for a schema change", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: { ...clearRisk, migration: "yes", sharedType: "yes" },
			hasSummary: false,
			records: [],
		});

		expect(floor.required).toEqual(["summary", "verify", "test", "contract", "migration", "picture"]);
	});

	test("adds one picture for auth or dependency risk", () => {
		for (const risk of [
			{ ...clearRisk, auth: "yes" as const },
			{ ...clearRisk, dependency: "yes" as const },
		]) {
			const floor = evidenceFloor({ kind: "backend", risk, hasSummary: false, records: [] });
			expect(floor.required.at(-1)).toBe("picture");
		}
	});

	test("adds equivalence proof for a deleted test", () => {
		const floor = evidenceFloor({
			kind: "backend",
			risk: { ...clearRisk, deletedTest: "yes" },
			hasSummary: false,
			records: [],
		});

		expect(floor.required.at(-1)).toBe("equivalence");
	});

	test("returns the exact fill command for each gap", () => {
		const floor = evidenceFloor({ kind: "backend", risk: clearRisk, hasSummary: true, records: [] });

		expect(floor.missing).toEqual([
			{
				item: "verify",
				fillCommand: 'trellis evidence add <pr> --kind verify --cmd "<command>" --exit <code> --sha <head> --tail -',
			},
			{
				item: "test",
				fillCommand: "trellis evidence add <pr> --kind test --name <test> --fails-on <base> --passes-on <head>",
			},
			{ item: "contract", fillCommand: "trellis evidence add <pr> --kind contract --before - --after -" },
		]);
	});
});
