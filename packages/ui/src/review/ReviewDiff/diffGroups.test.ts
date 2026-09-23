import { expect, test } from "bun:test";
import { type DiffFileGroup, groupHeaders, groupRank, groupReasons } from "./diffGroups";

const groups: DiffFileGroup[] = [
	{
		key: "risk",
		label: "Risk",
		files: [
			{ path: "drizzle/0100_x.sql", reasons: ["migration"] },
			{ path: "api/schemas/pr.ts", reasons: ["shared type"] },
		],
	},
	{ key: "behavior", label: "Behavior", files: [{ path: "web/page.tsx", reasons: [] }] },
	{ key: "noise", label: "Noise", files: [{ path: "bun.lock", reasons: [] }] },
];

test("the rank runs through the groups in order", () => {
	expect([...groupRank(groups)]).toEqual([
		["drizzle/0100_x.sql", 0],
		["api/schemas/pr.ts", 1],
		["web/page.tsx", 2],
		["bun.lock", 3],
	]);
});

test("only a file with a reason gets one", () => {
	expect([...groupReasons(groups)]).toEqual([
		["drizzle/0100_x.sql", ["migration"]],
		["api/schemas/pr.ts", ["shared type"]],
	]);
});

test("a header sits on the first file of its group and counts the files of that group", () => {
	expect([...groupHeaders(groups, ["drizzle/0100_x.sql", "api/schemas/pr.ts", "web/page.tsx", "bun.lock"])]).toEqual([
		["drizzle/0100_x.sql", { key: "risk", label: "Risk", count: 2 }],
		["web/page.tsx", { key: "behavior", label: "Behavior", count: 1 }],
		["bun.lock", { key: "noise", label: "Noise", count: 1 }],
	]);
});

test("a filter moves the header to the first file left, and a group with none gets none", () => {
	expect([...groupHeaders(groups, ["api/schemas/pr.ts", "bun.lock"])]).toEqual([
		["api/schemas/pr.ts", { key: "risk", label: "Risk", count: 1 }],
		["bun.lock", { key: "noise", label: "Noise", count: 1 }],
	]);
});
