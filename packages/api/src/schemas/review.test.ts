import { expect, test } from "bun:test";
import { reviewRef } from "../reviewRef/reviewRef.ts";
import {
	ReviewApplySchema,
	ReviewBodySchema,
	ReviewCreateSchema,
	ReviewPathSchema,
	ReviewRefSchema,
	ReviewSubmitSchema,
} from "./review.ts";

const id = "01M3QCAT1Z0M4RRC76X0G84ZP6";
const pr = "acme/app#727";
const headSha = "a".repeat(40);

test.each(["a", "界"])("preserves long review text (%s)", (character) => {
	const body = `${character.repeat(200_001)}\nlast line`;
	expect(ReviewBodySchema.parse(body)).toBe(body);
	expect(ReviewSubmitSchema.parse({ pr, headSha, verdict: "comment", body }).body).toBe(body);
	const message = `${character.repeat(10_001)}\nlast line`;
	expect(ReviewApplySchema.parse({ pr, headSha, threadIds: [id], message }).message).toBe(message);
});

test("accepts every selected thread and suggestion", () => {
	const threadIds = Array.from({ length: 201 }, (_, index) => `01M3QCAT1Z0M4RRC76X${String(index).padStart(7, "0")}`);
	expect(ReviewSubmitSchema.parse({ pr, headSha, verdict: "approve", threadIds }).threadIds).toEqual(threadIds);
	expect(ReviewApplySchema.parse({ pr, headSha, threadIds }).threadIds).toEqual(threadIds);
});

test("preserves long references, relative paths, and suggestion source", () => {
	const reference = `https://github.com/acme/app/pull/727?context=${"a".repeat(2049)}`;
	const path = `${"directory/".repeat(500)}file.ts`;
	const original = Array.from({ length: 10_001 }, (_, index) => `line ${index}`);
	const parsed = ReviewCreateSchema.parse({
		pr: reference,
		path,
		startLine: 1,
		line: original.length,
		body: "```suggestion\nreplacement\n```",
		original,
	});
	expect(ReviewRefSchema.parse(reference)).toBe(reference);
	expect(reviewRef(reference)).toMatchObject({ owner: "acme", repo: "app", number: 727 });
	expect(parsed.path).toBe(path);
	expect(parsed.original).toEqual(original);
});

test("retains reference grammar and relative file paths", () => {
	for (const reference of ["garbage", "acme/app#0", "acme/app#9007199254740992", "../app#1"])
		expect(() => reviewRef(reference)).toThrow();
	for (const path of ["", "/file.ts", "../file.ts", "a/../b", "a/./b", "a//b", "a/", "a\0b"])
		expect(ReviewPathSchema.safeParse(path).success).toBe(false);
});

test("retains required text, valid thread identifiers, and valid line ranges", () => {
	expect(ReviewBodySchema.safeParse(" \n ").success).toBe(false);
	expect(ReviewSubmitSchema.safeParse({ pr, headSha, verdict: "comment", body: " " }).success).toBe(false);
	expect(ReviewSubmitSchema.safeParse({ pr, headSha, verdict: "approve", threadIds: ["invalid"] }).success).toBe(false);
	expect(ReviewApplySchema.safeParse({ pr, headSha, threadIds: [] }).success).toBe(false);
	expect(ReviewApplySchema.safeParse({ pr, headSha, threadIds: ["invalid"] }).success).toBe(false);
	for (const lines of [{ line: 0 }, { line: 1.5 }, { line: 2, startLine: 3 }])
		expect(ReviewCreateSchema.safeParse({ pr, path: "file.ts", body: "comment", ...lines }).success).toBe(false);
});
