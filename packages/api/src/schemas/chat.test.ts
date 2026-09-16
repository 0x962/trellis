import { expect, test } from "bun:test";
import { ChatChannelRefSchema, ChatListInputSchema, ChatPostInputSchema, chatChannelName } from "./chat.ts";

test("a channel ref takes an optional # and any letter case", () => {
	for (const ref of ["ai", "#ai", "#General", "deploys-2", "a_b", " #ai "]) {
		expect(ChatChannelRefSchema.safeParse(ref).success, ref).toBe(true);
	}
	for (const ref of ["", "#", "##ai", "-ai", "a b", "a".repeat(33), "ai!"]) {
		expect(ChatChannelRefSchema.safeParse(ref).success, ref).toBe(false);
	}
});

test("the stored name drops the # and the case", () => {
	expect(chatChannelName("#General")).toBe("general");
	expect(chatChannelName(" ai ")).toBe("ai");
});

test("a list input coerces the limit from a query string and bounds it", () => {
	expect(ChatListInputSchema.parse({ project: "TRL", channel: "ai", limit: "20" }).limit).toBe(20);
	expect(ChatListInputSchema.parse({ project: "TRL", channel: "ai" }).limit).toBe(50);
	expect(ChatListInputSchema.safeParse({ project: "TRL", channel: "ai", limit: 201 }).success).toBe(false);
});

test("a post needs a body of 1 to 20000 characters", () => {
	expect(ChatPostInputSchema.safeParse({ project: "TRL", channel: "ai", body: "" }).success).toBe(false);
	expect(ChatPostInputSchema.safeParse({ project: "TRL", channel: "ai", body: "x".repeat(20_001) }).success).toBe(
		false,
	);
	expect(ChatPostInputSchema.safeParse({ project: "TRL", channel: "ai", body: "ok" }).success).toBe(true);
});

// A person types a chat message and a page limit, so each bound reads as a
// sentence.
test("a chat body out of bounds reads as a sentence", () => {
	const message = (body: string) =>
		ChatPostInputSchema.safeParse({ project: "TRL", channel: "ai", body }).error!.issues[0]!.message;
	expect(message("")).toBe("Enter a message of 1 to 20,000 characters.");
	expect(message("b".repeat(20_001))).toBe("Enter a message of 1 to 20,000 characters.");
});

test("a chat list limit out of bounds reads as a sentence", () => {
	const input = { project: "TRL", channel: "ai", limit: "201" };
	expect(ChatListInputSchema.safeParse(input).error!.issues[0]!.message).toBe("Enter a limit of 1 to 200.");
});
