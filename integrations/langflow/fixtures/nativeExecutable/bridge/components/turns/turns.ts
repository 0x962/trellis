import { createHash, randomUUID } from "node:crypto";
import { rename, writeFile } from "node:fs/promises";
import type { HarnessEvent } from "../../../../../../../packages/runtime-protocol/src/index.ts";
import type { NativeFixturePlan } from "../../../plan/plan.ts";

const hash = (value: string) => createHash("sha256").update(value).digest("hex");

export function createTurns(input: {
	plan: NativeFixturePlan;
	state: { sessionId: string; planHash: string; sequence: number };
	statePath: string;
	emit: (event: HarnessEvent) => Promise<void>;
	evidence: (value: Record<string, unknown>) => Promise<void>;
}) {
	let active: string | null = null;
	const sessionId = input.state.sessionId;
	return {
		current: () => active,
		async prompt(prompt: string) {
			if (active !== null) throw new Error("A fixture turn is still active");
			const matches = input.plan.turns.filter((turn) => prompt.includes(turn.marker));
			if (matches.length !== 1) throw new Error("The actual prompt must select exactly one fixture turn");
			const selected = matches[0]!;
			const turnId = randomUUID();
			active = turnId;
			input.state.sequence++;
			const temporary = `${input.statePath}.${process.pid}.tmp`;
			await writeFile(temporary, JSON.stringify(input.state), { mode: 0o600, flag: "wx" });
			await rename(temporary, input.statePath);
			await input.evidence({
				kind: "prompt-received",
				sessionId,
				turnId,
				sequence: input.state.sequence,
				promptSha256: hash(prompt),
				promptBytes: Buffer.byteLength(prompt),
			});
			await input.emit({ kind: "working", sessionId, turnId });
			await input.emit({ kind: "prompt", sessionId, turnId, activityId: `prompt-${turnId}`, prompt });
			if (selected.mode === "hold") return;
			const messageId = `result-${turnId}`;
			await input.emit({
				kind: "message",
				sessionId,
				turnId,
				message: { id: messageId, text: selected.result, complete: true },
			});
			await input.emit({
				kind: "idle",
				sessionId,
				turnId,
				outcome: "completed",
				result: selected.result,
				resultActivityIds: [messageId],
			});
			await input.evidence({ kind: "result-observed", sessionId, turnId, resultSha256: hash(selected.result) });
			active = null;
		},
		async interrupt(turnId: string) {
			if (active !== turnId) throw new Error("STALE_TURN");
			await input.emit({ kind: "idle", sessionId, turnId, outcome: "interrupted" });
			await input.evidence({ kind: "interrupted", sessionId, turnId });
			active = null;
		},
	};
}
