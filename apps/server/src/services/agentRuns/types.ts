import type { AgentRun } from "@trellis/api";

// One row of the `agent_runs` table. `instruction` is the prompt the harness
// launches with, up to 200000 characters. A query built with `storedColumns`
// does not read it, so the field is optional here.
export type StoredRun = Omit<AgentRun, "assigned" | "state" | "processStatus" | "observation"> & {
	closedAt: string | null;
	instruction?: string;
};

// A row that carries the prompt. A launch, a resume and a retry read one.
export type LaunchRun = StoredRun & { instruction: string };
