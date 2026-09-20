import { describe, expect, test } from "bun:test";
import type { TicketPr } from "@trellis/api";
import { prOf } from "../prOf";
import { prRowCells } from "./prRowText";

// The size cell holds a value, not text. `LineChanges` draws it, so this
// helper writes the counts the way that element writes them.
const textOf = (pr: TicketPr) =>
	prRowCells(pr)
		.map((cell) => ("lines" in cell ? `+${cell.lines.additions} −${cell.lines.deletions}` : cell.text))
		.join(" · ");

// Every risk answer is "no", so the floor holds only the items of the kind.
const clearRisk = {
	auth: "no",
	migration: "no",
	dependency: "no",
	sharedType: "no",
	deletedTest: "no",
} as const satisfies NonNullable<TicketPr["risk"]>;

const toneOf = (pr: TicketPr, key: string) => {
	const cell = prRowCells(pr).find((found) => found.key === key);
	return cell !== undefined && "tone" in cell ? cell.tone : undefined;
};

describe("prRowCells", () => {
	test("prints the state, the size, the checks, the threads and the turn in order", () => {
		const pr = prOf({
			additions: 311,
			deletions: 12,
			changedFiles: 6,
			fail: 1,
			pending: 6,
			pass: 47,
			openThreads: 2,
		});

		expect(textOf(pr)).toBe(
			"open · +311 −12 · 6 files · 1 failed · 6 pending · 47 passed · 2 threads · no evidence · agent",
		);
	});

	test("names the pull request this one is stacked on, after the state", () => {
		const pr = prOf({
			isDraft: true,
			stackedOn: { number: 55569, headRef: "nk/operator-routine-execution", ticketIdentifier: "TRL-32" },
			pass: 9,
		});

		expect(textOf(pr)).toBe("draft · stacked on #55569 · 9 passed · no evidence · agent");
	});

	test("names the state of the newest flow run before the turn", () => {
		const pr = prOf({ flowRuns: [{ status: "succeeded" }, { status: "failed" }], flowRunCount: 2, pass: 43 });

		expect(textOf(pr)).toBe("open · 43 passed · no evidence · flow: passed · you");
	});

	test("drops the size and the file count while GitHub has measured neither", () => {
		expect(textOf(prOf({ pass: 43 }))).toBe("open · 43 passed · no evidence · you");
	});

	test("drops a check bucket, a thread count and a flow that count zero", () => {
		expect(textOf(prOf({ state: "merged", pass: 43 }))).toBe("merged · 43 passed");
	});

	test("holds the changed line counts as a value for the shared element", () => {
		expect(prRowCells(prOf({ additions: 311, deletions: 12 })).find((cell) => cell.key === "size")).toEqual({
			key: "size",
			lines: { additions: 311, deletions: 12 },
		});
	});

	test("drops the size of a pull request that changes no line", () => {
		expect(textOf(prOf({ additions: 0, deletions: 0, changedFiles: 0, pass: 43 }))).toBe(
			"open · 43 passed · no evidence · you",
		);
	});

	test("writes the singular word for a count of one", () => {
		const pr = prOf({ additions: 4, deletions: 0, changedFiles: 1, openThreads: 1 });

		expect(textOf(pr)).toBe("open · +4 −0 · 1 file · 1 thread · no evidence · agent");
	});

	test("a merged pull request that was a draft reads as merged and leaves nobody to act", () => {
		expect(textOf(prOf({ state: "merged", isDraft: true }))).toBe("merged");
	});

	test("draws the failed count in the danger color and every other count in the row color", () => {
		const pr = prOf({ fail: 2, pass: 8 });

		expect(toneOf(pr, "failed")).toBe("danger");
		expect(toneOf(pr, "passed")).toBe("muted");
	});

	test("counts the records a frontend pull request carries against the records its floor requires", () => {
		const pr = prOf({ kind: "frontend", risk: clearRisk, evidence: 3, pass: 43 });

		expect(textOf(pr)).toBe("open · 43 passed · evidence 3 of 5 · you");
	});

	test("reads evidence complete when the pull request carries every record of its floor", () => {
		const pr = prOf({ kind: "backend", risk: clearRisk, evidence: 4, pass: 43 });

		expect(textOf(pr)).toBe("open · 43 passed · evidence complete · you");
	});

	test("counts the migration record and the picture that a migration adds to the floor", () => {
		const pr = prOf({ kind: "backend", risk: { ...clearRisk, migration: "yes" }, evidence: 4, pass: 43 });

		expect(textOf(pr)).toBe("open · 43 passed · evidence 4 of 6 · you");
	});

	test("reads no evidence when the pull request carries no record of its floor", () => {
		const pr = prOf({ kind: "frontend", risk: clearRisk, evidence: 0, pass: 43 });

		expect(textOf(pr)).toBe("open · 43 passed · no evidence · you");
	});

	test("reads no evidence while GitHub gives the pull request no file list", () => {
		expect(textOf(prOf({ kind: null, risk: null, evidence: null, pass: 43 }))).toBe(
			"open · 43 passed · no evidence · you",
		);
	});

	test("prints no evidence word on a merged or a closed pull request, which owes nothing", () => {
		const merged = prOf({ state: "merged", kind: "frontend", risk: clearRisk, evidence: 3, pass: 43 });
		const closed = prOf({ state: "closed", kind: "frontend", risk: clearRisk, evidence: 0, pass: 43 });

		expect(textOf(merged)).toBe("merged · 43 passed");
		expect(textOf(closed)).toBe("closed · 43 passed");
	});

	test("prints the evidence word on a draft, which still owes its records", () => {
		const pr = prOf({ isDraft: true, kind: "frontend", risk: clearRisk, evidence: 3, pass: 43 });

		expect(textOf(pr)).toBe("draft · 43 passed · evidence 3 of 5 · agent");
	});

	test("draws the turn of the person in the foreground color, and the turn of another in the row color", () => {
		expect(toneOf(prOf({ pass: 43 }), "turn")).toBe("fg");
		expect(toneOf(prOf({ pending: 1 }), "turn")).toBe("muted");
		expect(textOf(prOf({ pending: 1 }))).toBe("open · 1 pending · no evidence · github");
	});
});
