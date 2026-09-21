import { describe, expect, test } from "bun:test";
import { prOf } from "../prOf";
import { prPhoneCells, prRowCells } from "./prRowText";

describe("prRowCells", () => {
	test("returns only the pull request title", () => {
		const pr = prOf({
			title: "Show the title of a pull request on its row",
			additions: 311,
			deletions: 12,
			changedFiles: 6,
			fail: 1,
			pending: 6,
			pass: 47,
			openThreads: 2,
		});

		expect(prRowCells(pr)).toEqual([{ key: "title", text: "Show the title of a pull request on its row" }]);
	});
});

describe("prPhoneCells", () => {
	test("returns the pull request title", () => {
		const pr = prOf({ title: "Keep the phone row direct" });

		expect(prPhoneCells(pr)).toEqual([{ key: "title", text: "Keep the phone row direct" }]);
	});
});
