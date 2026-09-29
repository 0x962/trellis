import { appendFile } from "node:fs/promises";
import { join } from "node:path";

export function createEvidence(root: string, attemptId: string) {
	const file = join(root, "evidence", `${attemptId}.jsonl`);
	let pending = Promise.resolve();
	return (value: Record<string, unknown>) => {
		pending = pending.then(() =>
			appendFile(
				file,
				`${JSON.stringify({ at: new Date().toISOString(), pid: process.pid, attemptId, ...value })}\n`,
				{ mode: 0o600 },
			),
		);
		return pending;
	};
}
