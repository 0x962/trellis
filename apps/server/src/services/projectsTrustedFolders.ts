import type { ProjectSetTrustedFoldersInput, TrustedFolder } from "@trellis/api";
import { sql } from "drizzle-orm";
import { ulid } from "ulid";
import type { ServiceCtx } from "../context.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { projectActivity } from "./projectRows.ts";
import { chainOf, resolveMutableProject } from "./refs.ts";

// The folders trellis may mark as trusted for the agents of one project.
// A folder inside a listed path inherits the trust, so a ticket worktree
// under a listed repo root needs no row of its own.

// The trusted folder rows of the given projects, by path.
export const trustedFolderRows = (tx: Tx, projectIds: string[]): Promise<TrustedFolder[]> =>
	rows<TrustedFolder>(
		tx,
		sql`SELECT id, project_id AS "projectId", path FROM trusted_folders
			WHERE project_id = ANY(${textArray(projectIds)}) ORDER BY path`,
	);

// The paths that trust a folder for `projectId`: its own rows and the rows
// of every project above it.
export const effectiveTrustedRoots = async (ctx: ServiceCtx, tx: Tx, projectId: string): Promise<string[]> => {
	const chain = chainOf(ctx.cache, projectId).map((project) => project.id);
	return [...new Set((await trustedFolderRows(tx, chain)).map((row) => row.path))];
};

// One row per distinct path, sorted.
const normalize = (paths: string[]) => [...new Set(paths)].sort((a, b) => a.localeCompare(b));

// Replaces the whole trusted folder set of one project. An equal set
// writes nothing.
export const setTrustedFolders = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: ProjectSetTrustedFoldersInput,
): Promise<TrustedFolder[]> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const current = await trustedFolderRows(tx, [project.id]);
	const before = current.map((row) => row.path);
	const after = normalize(input.paths);
	if (before.join(",") === after.join(",")) return current;
	await tx.execute(sql`DELETE FROM trusted_folders WHERE project_id = ${project.id}`);
	for (const path of after) {
		await tx.execute(sql`INSERT INTO trusted_folders (id, project_id, path, created_at)
			VALUES (${ulid()}, ${project.id}, ${path}, ${ctx.now})`);
	}
	await projectActivity(ctx, tx, project.id, "project.updated", [
		{ field: "trustedFolders", from: null, to: null, meta: { from: before, to: after } },
	]);
	ctx.emit({ type: "project.updated", id: project.id });
	return trustedFolderRows(tx, [project.id]);
};

// Adds `path` to the trusted folders of one project. A path that a row of
// the project or of a project above it already covers writes nothing, so a
// second call after a human edited the list adds no duplicate.
export const addTrustedFolder = async (ctx: ServiceCtx, tx: Tx, projectId: string, path: string): Promise<boolean> => {
	const roots = await effectiveTrustedRoots(ctx, tx, projectId);
	if (roots.includes(path)) return false;
	await tx.execute(sql`INSERT INTO trusted_folders (id, project_id, path, created_at)
		VALUES (${ulid()}, ${projectId}, ${path}, ${ctx.now})`);
	await projectActivity(ctx, tx, projectId, "project.updated", [
		{ field: "trustedFolders", from: null, to: null, meta: { from: roots, to: [...roots, path].sort() } },
	]);
	ctx.emit({ type: "project.updated", id: projectId });
	return true;
};
