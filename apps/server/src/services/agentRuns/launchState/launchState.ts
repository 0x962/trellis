import { join } from "node:path";

const active = new Set<string>();

export const launchState = {
	has: (home: string, attemptId: string) => active.has(join(home, attemptId)),
	start: (home: string, attemptId: string) => {
		const key = join(home, attemptId);
		active.add(key);
		return () => active.delete(key);
	},
};
