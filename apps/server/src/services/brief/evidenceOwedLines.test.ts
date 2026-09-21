import { expect, test } from "bun:test";
import type { TicketContract } from "@trellis/api";
import { evidenceOwedLines } from "./evidenceOwedLines.ts";

const contract = (files: string[]): TicketContract => ({
	result: "Done.",
	files,
	leaveAlone: [],
	verify: [],
	reviewFocus: [],
});

test("prints the backend evidence floor", () => {
	expect(evidenceOwedLines(contract(["apps/server/src/services/brief.ts"]), "trellis")).toEqual([
		"## Evidence owed",
		"",
		"- Kind: backend",
		"- summary",
		"- verify record",
		"- test proof",
		"- contract table",
	]);
});

test("prints the frontend evidence floor", () => {
	expect(evidenceOwedLines(contract(["apps/web/src/routes/index.tsx"]), "trellis")).toEqual([
		"## Evidence owed",
		"",
		"- Kind: frontend",
		"- summary",
		"- after image",
		"- before image",
		"- capture record",
		"- console list",
	]);
});

test("names the equivalence condition for a test file", () => {
	expect(evidenceOwedLines(contract(["apps/web/src/App.test.tsx"]), "trellis")).toContain(
		"- A change that removes test cases also owes an equivalence proof.",
	);
});

test("prints the mixed floor and the required risk evidence", () => {
	expect(
		evidenceOwedLines(contract(["apps/web/src/routes/index.tsx", "apps/server/drizzle/0088_answer.sql"]), "trellis"),
	).toEqual([
		"## Evidence owed",
		"",
		"- Kind: mixed",
		"- summary",
		"- after image",
		"- before image",
		"- capture record",
		"- console list",
		"- verify record",
		"- test proof",
		"- contract table",
		"- migration plan",
		"- picture",
	]);
});

test("names the missing file list", () => {
	expect(evidenceOwedLines(contract([]), "trellis")).toEqual([
		"## Evidence owed",
		"",
		"- unknown. The contract names no file.",
	]);
	expect(evidenceOwedLines(contract(["apps/server/src/services/brief.ts"]), undefined)).toEqual([
		"## Evidence owed",
		"",
		"- unknown. The contract names no file.",
	]);
});
