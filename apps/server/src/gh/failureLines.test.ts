import { describe, expect, test } from "bun:test";
import { checkRunIdOf, failureLines } from "./failureLines.ts";
import type { GhRunner } from "./run.ts";

const ghAnswering = (result: object) =>
	Object.assign(async () => result, { bin: "gh", timeoutMs: 1000 }) as unknown as GhRunner;

describe("checkRunIdOf", () => {
	test("reads the job id of an Actions link and the id of a check app link", () => {
		expect(checkRunIdOf("https://github.com/o/r/actions/runs/17/job/4242")).toBe("4242");
		expect(checkRunIdOf("https://github.com/o/r/actions/runs/17/job/4242?pr=9")).toBe("4242");
		expect(checkRunIdOf("https://github.com/o/r/runs/99")).toBe("99");
	});

	test("gives null for a commit status link or no link", () => {
		expect(checkRunIdOf("https://ci.example.com/build/5")).toBeNull();
		expect(checkRunIdOf("https://github.com/o/r/actions/runs/17")).toBeNull();
		expect(checkRunIdOf(null)).toBeNull();
	});
});

describe("failureLines", () => {
	test("keeps the failure annotations, places each on its file, and stops at five lines", async () => {
		const annotations = [
			{ annotation_level: "warning", path: "a.ts", start_line: 1, message: "unused" },
			{
				annotation_level: "failure",
				path: "src/sort.test.ts",
				start_line: 8,
				message: "expected [1,2]\n\nreceived [2,1]",
			},
			{
				annotation_level: "failure",
				path: ".github",
				start_line: null,
				message: "Process completed with exit code 1.",
			},
			{ annotation_level: "failure", path: "b.ts", start_line: 2, message: "one\ntwo\nthree" },
		];
		const gh = ghAnswering({ ok: true, code: 0, stdout: JSON.stringify(annotations), stderr: "" });
		expect(await failureLines(gh, { owner: "o", repo: "r" }, "https://github.com/o/r/actions/runs/1/job/2")).toEqual([
			"src/sort.test.ts:8 expected [1,2]",
			"received [2,1]",
			"Process completed with exit code 1.",
			"b.ts:2 one",
			"two",
		]);
	});

	test("gives no lines when gh fails", async () => {
		const gh = ghAnswering({ ok: false, reason: "error", message: "HTTP 404", code: 1, stdout: "" });
		expect(await failureLines(gh, { owner: "o", repo: "r" }, "https://github.com/o/r/runs/3")).toEqual([]);
	});
});
