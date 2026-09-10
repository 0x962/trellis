import type { AgentRunnerProjectsOutput, RunnerProject } from "@trellis/api";
import { sql } from "drizzle-orm";
import { matchRunnerProject } from "../agents/runner.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import type { AgentsCtx } from "./agentSessions.ts";
import { effectiveRepos } from "./agentStart.ts";

// The runner call runs before the transaction opens, so the database stays
// free while superset runs.
export const prepareRunnerProjects = (ctx: AgentsCtx): Promise<RunnerProject[]> => ctx.runner.projects();

// A trellis project matches the runner project that holds the nearest of its
// declared repos. A builder start and a manager start use the same rule
// while the project's `supersetProjectId` is null.
export const runnerProjects = async (
	ctx: AgentsCtx,
	tx: Tx,
	projects: RunnerProject[],
): Promise<AgentRunnerProjectsOutput> => {
	const matches: AgentRunnerProjectsOutput["matches"] = [];
	for (const { id } of await rows<{ id: string }>(tx, sql`SELECT id FROM projects ORDER BY id`)) {
		const runnerProjectId = matchRunnerProject(projects, await effectiveRepos(ctx, tx, id));
		if (runnerProjectId !== null) matches.push({ projectId: id, runnerProjectId });
	}
	return { projects, matches };
};
