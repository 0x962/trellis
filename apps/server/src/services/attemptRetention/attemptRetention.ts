import { resolve } from "node:path";
import { withAttemptOperation } from "../langflowStops";

const readers = new Map<string, number>();
const keyOf = (home: string, attemptId: string) => resolve(home, "harness-attempts", attemptId);

// Resume replaces terminal_id before it reads the prior launch.json.
// Each reader retains the directory until its required reads finish.
export const attemptRetention = {
	async retain(home: string, attemptId: string | null): Promise<() => void> {
		if (attemptId === null) return () => {};
		return withAttemptOperation(home, attemptId, async () => {
			const key = keyOf(home, attemptId);
			readers.set(key, (readers.get(key) ?? 0) + 1);
			return () => {
				const remaining = readers.get(key)! - 1;
				if (remaining === 0) readers.delete(key);
				else readers.set(key, remaining);
			};
		});
	},
	has(home: string, attemptId: string) {
		return readers.has(keyOf(home, attemptId));
	},
};
