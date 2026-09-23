import type { ProjectSetReposInput, Repo } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { projectActivity } from "./projectRows.ts";
import { resolveMutableProject, resolveProject } from "./refs.ts";

type Pair = { owner: string; repo: string };

// The repo rows of one project, owner and repo in order.
export const repoRows = (tx: Tx, projectId: string): Promise<Repo[]> =>
	rows<Repo>(
		tx,
		sql`SELECT id, project_id AS "projectId", owner, repo FROM repos
			WHERE project_id = ${projectId} ORDER BY owner, repo`,
	);

const pairKey = (pair: Pair) => `${pair.owner}/${pair.repo}`;

// Lower case, one row per distinct pair, sorted.
const normalize = (pairs: Pair[]): Pair[] => {
	const byKey = new Map<string, Pair>();
	for (const pair of pairs) {
		const lower = { owner: pair.owner.toLowerCase(), repo: pair.repo.toLowerCase() };
		byKey.set(pairKey(lower), lower);
	}
	return [...byKey.values()].sort((a, b) => pairKey(a).localeCompare(pairKey(b)));
};

// Replaces the whole repo set of one project. An equal set writes nothing.
export const setRepos = async (ctx: ServiceCtx, tx: Tx, input: ProjectSetReposInput): Promise<Repo[]> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const current = await repoRows(tx, project.id);
	const before = current.map((repo) => ({ owner: repo.owner, repo: repo.repo }));
	const after = normalize(input.repos);
	if (before.map(pairKey).join(",") === after.map(pairKey).join(",")) return current;
	await tx.execute(sql`DELETE FROM repos WHERE project_id = ${project.id}`);
	for (const pair of after) {
		await tx.execute(
			sql`INSERT INTO repos (id, project_id, owner, repo) VALUES (${ulid()}, ${project.id}, ${pair.owner}, ${pair.repo})`,
		);
	}
	await projectActivity(ctx, tx, project.id, "project.updated", [
		{ field: "repos", from: null, to: null, meta: { from: before, to: after } },
	]);
	ctx.emit({ type: "project.updated", id: project.id });
	return repoRows(tx, project.id);
};

// The repos the poller scans for one project.
export const projectRepos = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<Repo[]> => {
	const project = await resolveProject(ctx, tx, input.project);
	return repoRows(tx, project.id);
};
