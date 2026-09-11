import { beforeEach, describe, expect, mock, test } from "bun:test";
import type { TrellisClient } from "@trellis/api";
import { z } from "zod";
import {
	actorHeader,
	actorStorageKey,
	hasActor,
	readActor,
	setActorName,
	subscribeActor,
	suggestedActorName,
} from "./actor";

beforeEach(() => localStorage.clear());

describe("lib/actor", () => {
	test("the storage key is trellis.actor", () => {
		expect(actorStorageKey).toBe("trellis.actor");
	});

	// WS-19. No stored identity is the first-run signal the root route reads.
	test("readActor returns null on a fresh profile", () => {
		expect(readActor()).toBeNull();
		expect(hasActor()).toBe(false);
	});

	// WS-20. The web only ever stores a human; agents come through the CLI.
	test("setActorName stores a human identity and formats the header", () => {
		const first = mock();
		const second = mock();
		const unsubscribe = subscribeActor(first);
		subscribeActor(second);
		setActorName("dana");
		expect(localStorage.getItem("trellis.actor")).toBe('{"name":"dana","kind":"human"}');
		expect(readActor()).toEqual({ name: "dana", kind: "human" });
		expect(hasActor()).toBe(true);
		expect(actorHeader()).toBe("human:dana");
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(1);
		unsubscribe();
		setActorName("nk");
		expect(first).toHaveBeenCalledTimes(1);
		expect(second).toHaveBeenCalledTimes(2);
	});

	// WS-21. The header grammar rejects a colon and a name over 64 chars, so
	// a name the server would refuse never reaches localStorage.
	test("setActorName rejects a name outside the header grammar", () => {
		setActorName("dana");
		expect(() => setActorName("na:vid")).toThrow(z.ZodError);
		expect(() => setActorName("a".repeat(65))).toThrow(z.ZodError);
		expect(localStorage.getItem("trellis.actor")).toBe('{"name":"dana","kind":"human"}');
	});

	// WS-22. The setup form prefills from actors.default and stores the
	// name only when Continue is pressed.
	test("the actors.default fallback prefills the name and stores nothing", async () => {
		const defaultActor = mock(async () => ({ name: "dana", kind: "human" as const }));
		const client = { actors: { default: defaultActor } } as unknown as TrellisClient;
		expect(await suggestedActorName(client)).toBe("dana");
		expect(defaultActor).toHaveBeenCalledTimes(1);
		expect(localStorage.getItem("trellis.actor")).toBeNull();
		expect(hasActor()).toBe(false);
	});
});
