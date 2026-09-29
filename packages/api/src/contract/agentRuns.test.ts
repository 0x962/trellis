import { describe, expect, test } from "bun:test";
import {
	AgentWorkspaceFileInputSchema,
	AgentWorkspacePageInputSchema,
	AgentWorkspaceSchema,
} from "../schemas/agentRun.ts";
import { AgentMessageSchema, TerminalDimensionSchema } from "./agentRuns.ts";

describe("AgentMessageSchema", () => {
	test.each([
		["ASCII", "a".repeat(20_001)],
		["multibyte", "界".repeat(20_001)],
	])("accepts a long %s message", (_, text) => expect(AgentMessageSchema.parse(text)).toBe(text));

	test("rejects an empty message", () => {
		expect(AgentMessageSchema.safeParse(" \n ").success).toBe(false);
	});
});

describe("AgentWorkspaceFileInputSchema", () => {
	test("accepts a 4208-character relative path", () => {
		const path = `${"nested/".repeat(600)}file.txt`;
		expect(AgentWorkspaceFileInputSchema.parse({ runId: "01M2PT14NJDS107B4TGK6PNFDA", path }).path).toBe(path);
	});
});

test("a workspace page carries an opaque cursor", () => {
	expect(AgentWorkspacePageInputSchema.parse({ runId: "01M2PT14NJDS107B4TGK6PNFDA", cursor: "next" }).cursor).toBe(
		"next",
	);
	expect(
		AgentWorkspaceSchema.parse({
			runId: "01M2PT14NJDS107B4TGK6PNFDA",
			phase: "diff",
			files: [],
			diff: "patch",
			truncated: false,
			nextCursor: null,
		}),
	).toMatchObject({ phase: "diff", diff: "patch", truncated: false, nextCursor: null });
});

test("terminal dimensions use the unsigned 16-bit range", () => {
	expect(TerminalDimensionSchema.parse(1001)).toBe(1001);
	expect(TerminalDimensionSchema.parse(65_535)).toBe(65_535);
	for (const dimension of [0, 1.5, 65_536]) expect(TerminalDimensionSchema.safeParse(dimension).success).toBe(false);
});
