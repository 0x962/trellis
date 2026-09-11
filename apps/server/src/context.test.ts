import { describe, expect, test } from "bun:test";
import { ORPCError } from "@orpc/server";
import { actorHeaderGrammar } from "@trellis/api";
import { createContext, requireActor, systemContext } from "./context.ts";

// A request context is built once per request from the headers and one
// reading of the clock. `x-trellis-actor` names who acts; a missing header
// leaves the actor null so a GET works without one, and `requireActor`
// refuses a mutation that has none.

const headers = (values: Record<string, string> = {}) => new Headers(values);

// A clock that advances one second on every reading.
const ticking = (start: Date) => {
	let ms = start.getTime();
	return () => {
		const now = new Date(ms);
		ms += 1000;
		return now;
	};
};

const failure = (fn: () => unknown) => {
	try {
		fn();
	} catch (error) {
		return error as ORPCError<string, Record<string, unknown>>;
	}
	throw new Error("Expected a throw.");
};

describe("createContext", () => {
	test("a valid actor header becomes the context actor", () => {
		const ctx = createContext({ headers: headers({ "x-trellis-actor": "human:dana" }), reqId: "req-7" });
		expect(ctx.actor).toEqual({ kind: "human", name: "dana" });
		expect(ctx.reqId).toBe("req-7");
		expect(ctx.session).toBeNull();
	});

	test("the session header reaches the context", () => {
		const ctx = createContext({
			headers: headers({ "x-trellis-actor": "agent:claude-code", "x-trellis-session": "s-1" }),
			reqId: "req-1",
		});
		expect(ctx.actor).toEqual({ kind: "agent", name: "claude-code" });
		expect(ctx.session).toBe("s-1");
	});

	test("a mutation without an actor header throws ACTOR_REQUIRED", () => {
		const ctx = createContext({ headers: headers(), reqId: "req-1" });
		const error = failure(() => requireActor(ctx));
		expect(error).toBeInstanceOf(ORPCError);
		expect(error.code).toBe("ACTOR_REQUIRED");
		expect(error.status).toBe(400);
	});

	test("a malformed actor header throws ACTOR_INVALID with the grammar", () => {
		const malformed = ["dana", "human:na:vid", "robot:x", `human:${"a".repeat(65)}`];
		for (const value of malformed) {
			const error = failure(() => createContext({ headers: headers({ "x-trellis-actor": value }), reqId: "req-1" }));
			expect(error, value).toBeInstanceOf(ORPCError);
			expect(error.code, value).toBe("ACTOR_INVALID");
			expect(error.status, value).toBe(400);
			expect(error.data, value).toEqual({ grammar: actorHeaderGrammar });
		}
	});

	test("the actor header rejects the system kind", () => {
		const error = failure(() =>
			createContext({ headers: headers({ "x-trellis-actor": "system:trellis" }), reqId: "req-1" }),
		);
		expect(error.code).toBe("ACTOR_INVALID");
	});

	test("a GET without an actor header keeps a null actor", () => {
		const ctx = createContext({ headers: headers(), reqId: "req-1" });
		expect(ctx.actor).toBeNull();
		expect(ctx.session).toBeNull();
	});

	test("systemContext acts as system:trellis", () => {
		const ctx = systemContext();
		expect(ctx.actor).toEqual({ kind: "system", name: "trellis" });
		expect(ctx.session).toBeNull();
		expect(typeof ctx.reqId).toBe("string");
		expect(ctx.now).toBeInstanceOf(Date);
	});

	test("ctx.now is one instant for the whole request", () => {
		const start = new Date("2026-09-09T12:00:00.000Z");
		const ctx = createContext({ headers: headers(), reqId: "req-1", clock: ticking(start) });
		const first = ctx.now.getTime();
		const second = ctx.now.getTime();
		expect(first).toBe(start.getTime());
		expect(second).toBe(first);
	});
});
