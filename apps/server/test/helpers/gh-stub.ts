import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ghStub points every gh runner built after it at test/stubs/gh.ts. It sets
// TRELLIS_GH_BIN, TRELLIS_GH_STUB_FILE, and TRELLIS_GH_STUB_LOG on process.env,
// so a runner built before the call keeps the previous binary. restore() puts
// the three variables back and drops the spawn log.

export type StubReply = { stdout: string; stderr: string; exitCode: number; delayMs?: number };

// One line of the spawn log, written by the stub at its start.
export type StubSpawn = {
	args: string[];
	env: { GH_PROMPT_DISABLED?: string; NO_COLOR?: string; PATH?: string };
	at: number;
	pid: number;
};

export type GhStubHandle = {
	spawns: () => StubSpawn[];
	reply: (key: string, entry: StubReply) => void;
	restore: () => void;
};

const stubPath = join(import.meta.dir, "..", "stubs", "gh.ts");
const envKeys = ["TRELLIS_GH_BIN", "TRELLIS_GH_STUB_FILE", "TRELLIS_GH_STUB_LOG"] as const;

export const ghStub = (dir: string, replies: Record<string, StubReply>): GhStubHandle => {
	const saved = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
	const file = join(dir, "replies.json");
	const log = join(dir, "spawns.log");
	const current = { ...replies };
	writeFileSync(file, JSON.stringify(current));
	process.env.TRELLIS_GH_BIN = stubPath;
	process.env.TRELLIS_GH_STUB_FILE = file;
	process.env.TRELLIS_GH_STUB_LOG = log;
	return {
		spawns: () => {
			if (!existsSync(log)) return [];
			return readFileSync(log, "utf8")
				.split("\n")
				.filter((line) => line.length > 0)
				.map((line) => JSON.parse(line) as StubSpawn);
		},
		reply: (key, entry) => {
			current[key] = entry;
			writeFileSync(file, JSON.stringify(current));
		},
		restore: () => {
			for (const key of envKeys) {
				const value = saved[key];
				if (value === undefined) delete process.env[key];
				else process.env[key] = value;
			}
			rmSync(log, { force: true });
		},
	};
};
