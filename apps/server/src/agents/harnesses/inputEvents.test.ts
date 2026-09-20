import { expect, test } from "bun:test";
import { CodexAppServerEvents } from "./codex/appServerEvents.ts";
import { applyTurnActivity } from "./turnActivity/turnActivity.ts";

test("Codex active flags preserve simultaneous permission and question states", () => {
	const parser = new CodexAppServerEvents("thread");
	const parse = (activeFlags: string[]) =>
		parser.parse({
			method: "thread/status/changed",
			params: { threadId: "thread", status: { type: "active", activeFlags } },
		});
	expect(parse(["waitingOnUserInput", "waitingOnApproval"]).map((event) => event.kind)).toEqual([
		"input-request",
		"input-request",
	]);
	expect(parse(["waitingOnUserInput"]).map((event) => event.kind)).toEqual(["input-request", "input-resolved"]);
	expect(parse([]).map((event) => event.kind)).toEqual(["input-resolved", "input-resolved"]);
	expect(
		parser.parse({ method: "serverRequest/resolved", params: { threadId: "thread", requestId: 7 } })[0],
	).toMatchObject({ requestId: "codex:request:7" });
	expect(parser.parse({ method: "thread/status/changed", params: { threadId: "other" } })).toEqual([]);
});

test("late input resolution does not start an idle bridge turn", () => {
	const current = { turnId: "turn", working: false };
	applyTurnActivity(current, { kind: "input-resolved", requestId: "q" });
	expect(current.working).toBe(false);
});

test("Codex observes nonblocking questions without answering another thread", () => {
	const parser = new CodexAppServerEvents("thread");
	const request = {
		id: 9,
		method: "item/tool/requestUserInput",
		params: { threadId: "thread", turnId: "turn", isBlocking: false },
	};
	expect(parser.parseRequest(request)[0]).toMatchObject({
		kind: "input-request",
		inputRequest: { id: "codex:request:9", blocking: false },
	});
	expect(parser.parseRequest({ ...request, params: { ...request.params, threadId: "child" } })).toEqual([]);
	expect(parser.parseRequest({ ...request, params: { ...request.params, isBlocking: true } })).toEqual([]);
});
