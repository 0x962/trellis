import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { open, readFile, rename, unlink } from "node:fs/promises";
import { join } from "node:path";

export type RestartSession = {
	runId: string;
	previousAttemptId: string;
	providerSessionId: string;
	// `custom` marks an agent the capture could not save; such an entry is
	// always `done` with the outcome `failed`.
	harness: "claude" | "codex" | "opencode" | "pi" | "custom";
	model?: string;
	effort?: string;
	workspace: string;
	processIdentity: string;
	attempt: { id: string; token: string };
	// `done` with an `outcome` records a finished entry. A resume that failed
	// keeps `done` unset and carries the failure in `error`, so a later resume
	// tries it again. A capture that could not save the agent writes `done`
	// with the outcome `failed` and the reason in `error`; a resume never
	// touches that entry, and the restart status shows the reason.
	done?: boolean;
	outcome?: "resumed" | "skipped" | "failed";
	error?: string;
};

export type RestartPlan = {
	version: 1;
	id: string;
	sourceReleaseId: string;
	targetReleaseId: string;
	createdAt: string;
	sessions: RestartSession[];
};

export function restartPending(home: string): boolean {
	return existsSync(join(home, "restart-plan.json"));
}

export async function readRestartPlan(home: string): Promise<RestartPlan | null> {
	if (!restartPending(home)) return null;
	return JSON.parse(await readFile(join(home, "restart-plan.json"), "utf8"));
}

export async function writeRestartPlan(home: string, plan: RestartPlan): Promise<void> {
	const path = join(home, `restart-plan.${randomUUID()}.tmp`);
	const file = await open(path, "wx", 0o600);
	try {
		await file.writeFile(`${JSON.stringify(plan)}\n`);
		await file.sync();
	} finally {
		await file.close();
	}
	await rename(path, join(home, "restart-plan.json"));
}

export async function removeRestartPlan(home: string): Promise<void> {
	await unlink(join(home, "restart-plan.json"));
}
