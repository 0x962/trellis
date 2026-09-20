import { expect, test } from "bun:test";
import type { TicketContract } from "@trellis/api";
import { evidenceLines } from "./evidenceLines.ts";

const contract = (files: string[]): TicketContract => ({
	result: "Done.",
	files,
	leaveAlone: [],
	verify: [],
	reviewFocus: [],
});

test("prints the backend evidence floor", () => {
	expect(evidenceLines(contract(["apps/server/src/services/brief.ts"]), "trellis")).toEqual([
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
	expect(evidenceLines(contract(["apps/web/src/routes/index.tsx"]), "trellis")).toEqual([
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

test("prints the mixed floor and the required risk evidence", () => {
	expect(
		evidenceLines(contract(["apps/web/src/routes/index.tsx", "apps/server/drizzle/0088_answer.sql"]), "trellis"),
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
	expect(evidenceLines(contract([]), "trellis")).toEqual([
		"## Evidence owed",
		"",
		"- unknown. The contract names no file.",
	]);
});
