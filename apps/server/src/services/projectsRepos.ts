import type { ProjectSetReposInput, Repo } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { projectActivity } from "./projectRows.ts";
import { chainOf, resolveMutableProject, resolveProject } from "./refs.ts";

type Pair = { owner: string; repo: string };

// The repo rows of the given projects, owner and repo in order, the nearest
// project first when two projects hold the same pair.
export const repoRows = (tx: Tx, projectIds: string[]): Promise<Repo[]> =>
	rows<Repo>(
		tx,
		sql`SELECT id, project_id AS "projectId", owner, repo FROM repos
			WHERE project_id = ANY(${textArray(projectIds)})
			ORDER BY owner, repo, array_position(${textArray(projectIds)}, project_id)`,
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
	const current = await repoRows(tx, [project.id]);
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
	return repoRows(tx, [project.id]);
};

// The project's own repos plus its ancestors', one row per distinct pair.
export const effectiveRepos = async (ctx: ServiceCtx, tx: Tx, input: { project: string }): Promise<Repo[]> => {
	const project = await resolveProject(ctx, tx, input.project);
	const chain = chainOf(ctx.cache, project.id).map((ancestor) => ancestor.id);
	const seen = new Set<string>();
	return (await repoRows(tx, chain)).filter((repo) => {
		const key = pairKey(repo);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
};
