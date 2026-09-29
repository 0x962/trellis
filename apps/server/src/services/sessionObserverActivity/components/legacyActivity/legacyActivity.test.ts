import { expect, test } from "bun:test";
import { LegacyActivity } from "./legacyActivity.ts";

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
