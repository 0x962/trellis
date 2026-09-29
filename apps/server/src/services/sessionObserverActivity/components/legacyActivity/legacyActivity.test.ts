import { expect, test } from "bun:test";
import type { HarnessEvent } from "@trellis/runtime-protocol";
import { LegacyActivity } from "./legacyActivity.ts";

test("same-turn request cycles retain distinct signals and stable replay identities", () => {
	const request: HarnessEvent = {
		kind: "input-request",
		inputRequest: { id: "codex:waitingOnUserInput", kind: "question", title: "Choose", blocking: true },
	};
	const resolved: HarnessEvent = { kind: "input-resolved", requestId: "codex:waitingOnUserInput" };
	const events: HarnessEvent[] = [
		{ kind: "working", turnId: "turn" },
		request,
		request,
		resolved,
		resolved,
		request,
		request,
	];
	const read = () => {
		const state = new LegacyActivity();
		return events.flatMap((event) => {
			const result = state.read(event, "2026-09-29T12:00:00.000Z");
			return result.signal === undefined ? [] : [result.signal];
		});
	};
	const signals = read();
	expect(signals).toHaveLength(2);
	expect(signals[0]!.id).not.toBe(signals[1]!.id);
	expect(read()).toEqual(signals);
});

test("a repeated status request belongs to each explicit provider turn", () => {
	const state = new LegacyActivity();
	const at = "2026-09-29T12:00:00.000Z";
	for (const turnId of ["turn-one", "turn-two"]) {
		state.read({ kind: "working", turnId }, at);
		const question = state.read(
			{
				kind: "input-request",
				inputRequest: {
					id: "codex:waitingOnUserInput",
					kind: "question",
					title: "Choose",
					blocking: true,
				},
			},
			at,
		);
		expect(question.signal).toMatchObject({ id: `input:${turnId}:codex:waitingOnUserInput`, turnId });
		state.read({ kind: "input-resolved", requestId: "codex:waitingOnUserInput" }, at);
		state.read({ kind: "idle", turnId, outcome: "completed" }, at);
	}
});
