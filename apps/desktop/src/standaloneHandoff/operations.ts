import { execFile } from "node:child_process";
import { join } from "node:path";
import { setTimeout } from "node:timers/promises";
import { promisify } from "node:util";
import type { StandaloneCandidate, StandaloneHandoffResult } from "./types.ts";

export type HandoffOperations = {
	alive: (pid: number) => boolean;
	launchdOwner: (domain: string) => Promise<{ pid: number; home: string | null } | null>;
	disable: (domain: string) => Promise<void>;
	bootout: (domain: string) => Promise<void>;
	waitForExit: (pid: number) => Promise<void>;
	prepare: (resources: string, candidate: StandaloneCandidate) => Promise<StandaloneHandoffResult>;
};
const execute = promisify(execFile);
const alive = (pid: number) => {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ESRCH") return false;
		throw error;
	}
};

export const handoffOperations: HandoffOperations = {
	alive,
	launchdOwner: async (domain) => {
		try {
			const { stdout } = await execute("launchctl", ["print", `${domain}/com.trellis.server`]);
			const pid = /^\s*pid = (\d+)\s*$/m.exec(stdout);
			const home = /^\s*TRELLIS_HOME => (.+)$/m.exec(stdout);
			return pid ? { pid: Number(pid[1]), home: home?.[1]?.trim() ?? null } : null;
		} catch (error) {
			if ((error as Error & { stderr?: string }).stderr?.includes("Could not find service")) return null;
			throw error;
		}
	},
	disable: async (domain) => {
		await execute("launchctl", ["disable", `${domain}/com.trellis.server`]);
	},
	bootout: async (domain) => {
		await execute("launchctl", ["bootout", `${domain}/com.trellis.server`]);
	},
	waitForExit: async (pid) => {
		const deadline = Date.now() + 10_000;
		while (alive(pid)) {
			if (Date.now() >= deadline)
				throw new Error(`Standalone process ${pid} has not exited. The database stays closed.`);
			await setTimeout(50);
		}
	},
	prepare: async (resources, candidate) => {
		const args = [
			join(resources, "apps/server/src/standaloneHandoff/entry.ts"),
			"--home",
			candidate.home,
			"--backup",
			candidate.backupPath,
		];
		if (candidate.service) args.push("--restore-standalone-service");
		try {
			const { stdout } = await execute(join(resources, "bin/bun"), args, { maxBuffer: 4 * 1024 * 1024 });
			return JSON.parse(stdout);
		} catch (error) {
			const failure = error as Error & { stderr?: string };
			throw new Error(failure.stderr?.trim() || failure.message);
		}
	},
};
