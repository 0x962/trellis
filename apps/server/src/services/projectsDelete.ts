import type { ProjectDeleteOutputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { ServiceCtx } from "../context.ts";
import { resourceBlobShasOfProjects } from "../db/queries/epicResources.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { projectActivity } from "./projectRows.ts";
import { pathOf, resolveMutableProject } from "./refs.ts";

type ProjectDeleteOutput = z.infer<typeof ProjectDeleteOutputSchema>;

export type ProjectDeleteInput = { project: string; force?: boolean };

// A hard delete. Without `force` the subtree holds no ticket and no
// sub-project. With `force` every project and ticket below goes too, and
// their comments, attachments, links, and activity go with them through the
// foreign keys. A human deletes without force; an agent needs force. One
// activity row on the parent keeps the trace; a root leaves none, because
// its rows are gone with it.
const remove = async (ctx: ServiceCtx, tx: Tx, input: ProjectDeleteInput): Promise<ProjectDeleteOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const force = input.force ?? false;
	if (ctx.actor?.kind === "agent" && !force) throw fail("AGENT_CANNOT_DELETE");
	const subtree = ctx.cache.resolveSubtree(project.id);
	const scope = textArray(subtree);
	const counted = await rows<{ n: number }>(
		tx,
		sql`SELECT count(*)::int AS n FROM tickets WHERE project_id = ANY(${scope})`,
	);
	const tickets = counted[0]!.n;
	const projects = subtree.length - 1;
	if (!force && (tickets > 0 || projects > 0)) throw fail("PROJECT_NOT_EMPTY", { tickets, projects });
	const path = pathOf(ctx.cache, project.id);
	// A ticket outside the subtree may name a deleted ticket as its parent,
	// and the parent foreign key refuses the delete while it does.
	await tx.execute(
		sql`UPDATE tickets SET parent_id = NULL
			WHERE parent_id IN (SELECT id FROM tickets WHERE project_id = ANY(${scope}))`,
	);
	const blobs = await rows<{ sha256: string }>(
		tx,
		sql`SELECT DISTINCT a.sha256 FROM attachments a JOIN tickets t ON t.id = a.ticket_id
			WHERE t.project_id = ANY(${scope})`,
	);
	const resourceBlobs = await resourceBlobShasOfProjects(tx, subtree);
	await tx.execute(sql`DELETE FROM tickets WHERE project_id = ANY(${scope})`);
	ctx.dropBlobs([...blobs.map((blob) => blob.sha256), ...resourceBlobs]);
	await tx.execute(
		sql`DELETE FROM pull_requests pr
			WHERE NOT pr.review_retained AND NOT EXISTS (SELECT 1 FROM ticket_pull_requests l WHERE l.pull_request_id = pr.id)`,
	);
	// A ticket outside the subtree may sit in an epic of a deleted project.
	// The project delete cascades to that epic and sets `epic_id` NULL on the
	// ticket, and the check `tickets_wave_needs_epic` refuses a row that
	// loses its epic while it still holds a wave.
	await tx.execute(
		sql`UPDATE tickets SET wave_id = NULL
			WHERE wave_id IS NOT NULL AND epic_id IN (SELECT id FROM epics WHERE project_id = ANY(${scope}))`,
	);
	await tx.execute(sql`DELETE FROM projects WHERE id = ANY(${scope})`);
	if (project.parentId !== null) {
		await projectActivity(ctx, tx, project.parentId, "project.deleted", [
			{ field: null, from: null, to: null, meta: { path, name: project.name, id: project.id, tickets, projects } },
		]);
	}
	await ctx.cache.rebuild(tx);
	ctx.emit({ type: "project.deleted", id: project.id });
	return { deleted: path };
};

export { remove as delete };
