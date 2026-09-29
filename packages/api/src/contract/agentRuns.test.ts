import { describe, expect, test } from "bun:test";
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

test("terminal dimensions use the unsigned 16-bit range", () => {
	expect(TerminalDimensionSchema.parse(1001)).toBe(1001);
	expect(TerminalDimensionSchema.parse(65_535)).toBe(65_535);
	for (const dimension of [0, 1.5, 65_536]) expect(TerminalDimensionSchema.safeParse(dimension).success).toBe(false);
});
