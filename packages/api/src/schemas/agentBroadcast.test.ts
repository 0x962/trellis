import { describe, expect, test } from "bun:test";
import { AgentBroadcastInputSchema } from "./agentBroadcast.ts";

const input = (text: string) => ({ group: "working" as const, text, requestId: "request-1" });

describe("AgentBroadcastInputSchema", () => {
	test.each([
		["ASCII", "a".repeat(20_001)],
		["multibyte", "界".repeat(20_001)],
	])("accepts a long %s message", (_, text) => expect(AgentBroadcastInputSchema.parse(input(text)).text).toBe(text));

	test("rejects an empty message", () => {
		expect(AgentBroadcastInputSchema.safeParse(input(" \n ")).success).toBe(false);
	});
});
