import { describe, expect, test } from "bun:test";
import { AgentCommandSchema } from "./agentCommand.ts";

describe("AgentCommandSchema", () => {
	test.each([
		["ASCII", "a".repeat(20_001)],
		["multibyte", "界".repeat(20_001)],
	])("accepts a long %s command", (_, command) => expect(AgentCommandSchema.parse(command)).toBe(command));

	test("rejects an empty command", () => {
		expect(AgentCommandSchema.safeParse(" \n ").success).toBe(false);
	});

	test("rejects an unknown template variable", () => {
		expect(AgentCommandSchema.safeParse("agent {{unknown}}").success).toBe(false);
	});
});
