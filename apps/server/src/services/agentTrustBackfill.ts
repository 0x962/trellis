import { sql } from "drizzle-orm";
import { matchRunnerProject } from "../agents/runner.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import type { AgentsCtx } from "./agentSessions.ts";
import { readAgentSettings } from "./agentSettings.ts";
import { effectiveRepos } from "./agentStart.ts";
import { addTrustedFolder } from "./projectsTrustedFolders.ts";

// The default trusted folder of a project: the repo root of the runner
// project it works in. A SQL migration cannot write it, because that path
// lives in Superset and not in the trellis database, so the agents host
// runs this instead. It covers the projects that existed before trellis
// had trusted folders and every project that gets a runner project later.
//
// This settings row holds the pairs the backfill already wrote, so a
// person who removes a folder keeps it removed across every restart.

const KEY = "agents.trustedRootsWritten";

type Written = { pairs: string[] };

const pairKey = (projectId: string, runnerProjectId: string) => `${projectId}:${runnerProjectId}`;

const readWritten = async (tx: Tx): Promise<Written> => {
	const [found] = await rows<{ value: Written }>(tx, sql`SELECT value FROM settings WHERE key = ${KEY}`);
	return found === undefined ? { pairs: [] } : found.value;
};

export type TrustBackfillPlan = { roots: Array<{ projectId: string; runnerProjectId: string; path: string }> };

export const prepareTrustBackfill = async (ctx: AgentsCtx): Promise<TrustBackfillPlan> => {
	const found = await ctx.newTx(async (tx) => ({
		written: await readWritten(tx),
		settings: await readAgentSettings(tx),
	}));
	if (!found.settings.enabled) return { roots: [] };
	const enabled = found.settings.projects.filter((row) => row.enabled);
	if (enabled.length === 0) return { roots: [] };
	const projects = await ctx.runner.projects();
	const roots: TrustBackfillPlan["roots"] = [];
	for (const row of enabled) {
		// A project the settings still name may be deleted, and the chain
		// read below needs a project the cache knows.
		if (ctx.cache.get(row.projectId) === undefined) continue;
		const repos = await ctx.newTx((tx) => effectiveRepos(ctx, tx, row.projectId));
		const runnerProjectId = row.supersetProjectId ?? matchRunnerProject(projects, repos);
		if (runnerProjectId === null) continue;
		if (found.written.pairs.includes(pairKey(row.projectId, runnerProjectId))) continue;
		const project = projects.find((candidate) => candidate.id === runnerProjectId);
		if (project !== undefined) roots.push({ projectId: row.projectId, runnerProjectId, path: project.path });
	}
	return { roots };
};

export const trustBackfill = async (ctx: AgentsCtx, tx: Tx, plan: TrustBackfillPlan) => {
	if (plan.roots.length === 0) return { added: 0 };
	let added = 0;
	for (const root of plan.roots) {
		if (await addTrustedFolder(ctx, tx, root.projectId, root.path)) added += 1;
	}
	const written = await readWritten(tx);
	const pairs = [
		...new Set([...written.pairs, ...plan.roots.map((root) => pairKey(root.projectId, root.runnerProjectId))]),
	];
	await tx.execute(sql`INSERT INTO settings (key, value, updated_at)
		VALUES (${KEY}, ${JSON.stringify({ pairs })}::jsonb, ${ctx.now})
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`);
	return { added };
};
