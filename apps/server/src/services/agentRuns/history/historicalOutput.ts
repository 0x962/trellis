import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRun } from "@trellis/api";

export const historicalOutput = async (
	home: string,
	run: Omit<AgentRun, "assigned" | "state" | "processStatus" | "observation">,
) => {
	const identity = `Assignment ${run.id}; ${run.runtime}; workspace ${run.workspaceId ?? "not recorded"}; terminal ${run.terminalId ?? "not recorded"}.`;
	const path = join(home, "agents", run.id, "output.txt");
	try {
		const [text, file] = await Promise.all([readFile(path, "utf8"), stat(path)]);
		return {
			text: `Historical terminal capture saved ${file.mtime.toISOString()}. This is not live output.\n${identity}\n${run.error ?? "The external session is unavailable."}\n\n${text}`,
		};
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
		return {
			text: `No retained terminal capture is available.\n${identity}\n${run.error ?? "The external session is unavailable."}`,
		};
	}
};
