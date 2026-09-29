import { describe, expect, test } from "bun:test";
import { AgentWorkspaceFileInputSchema } from "../schemas/agentRun.ts";
import { AgentMessageSchema } from "./agentRuns.ts";

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
