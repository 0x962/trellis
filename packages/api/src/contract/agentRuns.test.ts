import { describe, expect, test } from "bun:test";
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
