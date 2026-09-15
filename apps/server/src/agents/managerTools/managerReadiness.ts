import { readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";

const receipt = z.object({ attemptId: z.string(), token: z.string() });

export const managerReadiness = {
	record(path: string, attemptId: string, token: string) {
		writeFileSync(path, JSON.stringify({ attemptId, token }), { mode: 0o600 });
	},
	confirmed(path: string, attemptId: string, token: string): boolean {
		try {
			const parsed = receipt.safeParse(JSON.parse(readFileSync(path, "utf8")));
			return parsed.success && parsed.data.attemptId === attemptId && parsed.data.token === token;
		} catch {
			return false;
		}
	},
};
