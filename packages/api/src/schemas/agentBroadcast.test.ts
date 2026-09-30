import { describe, expect, test } from "bun:test";
import { AgentBroadcastInputSchema, AgentBroadcastRecipientsInputSchema } from "./agentBroadcast.ts";

const input = (text: string) => ({ group: "working" as const, text, requestId: "request-1" });

describe("AgentBroadcastInputSchema", () => {
	test.each(["working", "idle", "both"])("accepts the %s recipient selection", (group) => {
		expect(AgentBroadcastInputSchema.parse({ ...input("Message"), group }).group).toBe(group);
	});

	test.each([[undefined], [""], ["all"], [[]]])("rejects an invalid recipient selection: %j", (group) => {
		expect(AgentBroadcastInputSchema.safeParse({ ...input("Message"), group }).success).toBe(false);
	});

	test.each([
		["ASCII", "a".repeat(20_001)],
		["multibyte", "界".repeat(20_001)],
	])("accepts a long %s message", (_, text) => expect(AgentBroadcastInputSchema.parse(input(text)).text).toBe(text));

	test("rejects an empty message", () => {
		expect(AgentBroadcastInputSchema.safeParse(input(" \n ")).success).toBe(false);
	});

	test("accepts an epic scope for counts and delivery and rejects an empty scope", () => {
		expect(AgentBroadcastRecipientsInputSchema.parse({ epic: "DEMO/account-settings" })).toEqual({
			epic: "DEMO/account-settings",
		});
		expect(AgentBroadcastInputSchema.parse({ ...input("Message"), epic: "DEMO/account-settings" }).epic).toBe(
			"DEMO/account-settings",
		);
		expect(AgentBroadcastRecipientsInputSchema.safeParse({ epic: "" }).success).toBe(false);
		expect(AgentBroadcastInputSchema.safeParse({ ...input("Message"), epic: "" }).success).toBe(false);
	});
});
