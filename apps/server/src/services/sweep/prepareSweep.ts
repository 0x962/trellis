import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { sql } from "drizzle-orm";
import { agentWorkspacesRoot } from "../../agents/native/workspace.ts";
import { rows } from "../../db/queries/support.ts";
import { executionEnvironment } from "../../executionEnvironment";
import { readRuntimeSessions } from "../agentRuns/liveState.ts";
import type { ServiceCtx } from "../support.ts";
import { attemptsToRemove, outputFilesToRemove, type SweepRun, workspaceRemovable } from "./decide.ts";

// The sweep removes the files of finished agent work from the data home:
// the worktree of a run that is closed on a done or canceled ticket, the
// terminal output files of earlier terminals, and the launch directory of
// an attempt that no run holds any more. The runtime keeps its own session
// records within a ceiling; this sweep covers the files the server writes.
//
// A worktree goes through `git worktree remove` without `--force`, so git
// refuses a worktree with a modified or untracked file, whatever the sweep
// decided. The branch of the run stays in the source repository, so a
// commit the agent made stays reachable.

const exec = promisify(execFile);

// A launch creates its attempt directory before it writes the terminal id
// to the run. An attempt younger than this stays.
export const ATTEMPT_MIN_AGE_MS = 60 * 60 * 1000;

const attemptName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type SweepResult = {
	removedWorkspaces: string[];
	removedOutputFiles: number;
	removedAttempts: number;
	errors: string[];
};

// A failed git command carries git's own words in `stderr`.
const gitText = (error: unknown) =>
	((error as { stderr?: string }).stderr || (error instanceof Error ? error.message : String(error))).trim();

const directories = async (path: string) =>
	existsSync(path)
		? (await readdir(path, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
		: [];

// Removes the worktree when its tree is clean. Returns the path it removed,
// or null when a modified or untracked file keeps the worktree.
const removeWorktree = async (work: string, env: NodeJS.ProcessEnv): Promise<string | null> => {
	const status = await exec("git", ["-C", work, "status", "--porcelain"], { env });
	if (status.stdout.trim() !== "") return null;
	await exec("git", ["-C", work, "worktree", "remove", work], { env });
	return work;
};

async function sweep(ctx: ServiceCtx): Promise<SweepResult> {
	const runs = await ctx.newTx((tx) =>
		rows<SweepRun>(
			tx,
			sql`SELECT id, kind, runtime, workspace_id AS "workspaceId", terminal_id AS "terminalId", closed_at IS NULL AS open,
			(SELECT statuses.category FROM tickets JOIN statuses ON statuses.id=tickets.status_id WHERE tickets.id=agent_runs.ticket_id) AS "ticketCategory"
			FROM agent_runs`,
		),
	);
	const running = (await readRuntimeSessions(ctx.home, { status: "running" })).map((session) => ({
		id: session.id,
		cwd: session.launch?.cwd ?? null,
	}));
	const byId = new Map(runs.map((run) => [run.id, run]));
	const result: SweepResult = { removedWorkspaces: [], removedOutputFiles: 0, removedAttempts: 0, errors: [] };
	// The login shell that gives git its PATH runs once, and only for a sweep
	// that has a worktree to remove.
	let env: NodeJS.ProcessEnv | undefined;
	const gitEnv = async () => (env ??= await executionEnvironment());
	const agents = agentWorkspacesRoot(ctx.home);
	for (const runId of await directories(agents)) {
		const directory = join(agents, runId);
		const names = await readdir(directory);
		for (const name of outputFilesToRemove(names, byId.get(runId))) {
			await rm(join(directory, name), { force: true });
			result.removedOutputFiles += 1;
		}
		const work = join(directory, "work");
		if (!names.includes("work") || !existsSync(join(work, ".git"))) continue;
		if (!workspaceRemovable(work, runs, running)) continue;
		// One worktree that git cannot remove, for example one whose source
		// repository is gone, does not stop the sweep of the others.
		const removed = await removeWorktree(work, await gitEnv()).catch((error: unknown) => {
			result.errors.push(`${work}: ${gitText(error)}`);
			return null;
		});
		if (removed !== null) result.removedWorkspaces.push(removed);
	}
	const current = new Set(runs.map((run) => run.terminalId).filter((id): id is string => id !== null));
	const attemptsRoot = join(ctx.home, "harness-attempts");
	const attempts = [];
	for (const name of await directories(attemptsRoot)) {
		if (!attemptName.test(name)) continue;
		attempts.push({ id: name, modifiedAt: (await stat(join(attemptsRoot, name))).mtimeMs });
	}
	for (const id of attemptsToRemove(attempts, current, ctx.now().getTime(), ATTEMPT_MIN_AGE_MS)) {
		await rm(join(attemptsRoot, id), { recursive: true, force: true });
		result.removedAttempts += 1;
	}
	return result;
}

const active = new Map<string, Promise<SweepResult>>();

// One sweep runs per data home at a time. A call during a sweep joins it.
export function prepareSweep(ctx: ServiceCtx, _input: Record<string, never> = {}) {
	const current = active.get(ctx.home);
	if (current) return current;
	const work = sweep(ctx).finally(() => active.delete(ctx.home));
	active.set(ctx.home, work);
	return work;
}
