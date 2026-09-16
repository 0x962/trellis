import { describe, expect, test } from "bun:test";
import { wantsChatSound } from "./chatSound";

const dana = { name: "dana", kind: "human" };
const message = (actor: { name: string; kind: string }) => ({
	type: "chat.message",
	id: "01J8Z6X4Q3M2K1H0G9F8E7D6M1",
	projectId: "01J8Z6X4Q3M2K1H0G9F8E7D6P1",
	channel: "ai",
	actor,
});

describe("lib/chatSound", () => {
	test("a message from someone else plays while the sound is on", () => {
		expect(
			wantsChatSound(message({ name: "01J8Z6X4Q3M2K1H0G9F8E7D6G1", kind: "agent" }), { sound: true, actor: dana }),
		).toBe(true);
		expect(wantsChatSound(message({ name: "dana", kind: "agent" }), { sound: true, actor: dana })).toBe(true);
	});

	test("your own message, a delivery update, and the switched off sound stay silent", () => {
		expect(wantsChatSound(message(dana), { sound: true, actor: dana })).toBe(false);
		expect(
			wantsChatSound({ ...message({ name: "x", kind: "agent" }), type: "chat.delivery" }, { sound: true, actor: dana }),
		).toBe(false);
		expect(wantsChatSound(message({ name: "x", kind: "agent" }), { sound: false, actor: dana })).toBe(false);
	});
});
