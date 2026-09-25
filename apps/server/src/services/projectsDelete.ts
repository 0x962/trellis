import type { ProjectDeleteOutputSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { z } from "zod";
import type { PageCleanupCtx } from "../context.ts";
import { resourceBlobShasOfProjects } from "../db/queries/epicResources.ts";
import { rows, textArray } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { fail } from "../errors.ts";
import { pageObjects } from "./pages/objects.ts";
import { resolveMutableProject } from "./refs.ts";

type ProjectDeleteOutput = z.infer<typeof ProjectDeleteOutputSchema>;

export type ProjectDeleteInput = { project: string; force?: boolean };

// A hard delete. Without `force` the project holds no ticket and no flow.
// With `force` every ticket goes too, and their comments, attachments,
// links, and activity go with them through the foreign keys. A human deletes
// without force; an agent needs force. The project leaves no activity row,
// because its rows are gone with it.
const remove = async (ctx: PageCleanupCtx, tx: Tx, input: ProjectDeleteInput): Promise<ProjectDeleteOutput> => {
	const project = await resolveMutableProject(ctx, tx, input.project);
	const force = input.force ?? false;
	if (ctx.actor?.kind === "agent" && !force) throw fail("AGENT_CANNOT_DELETE");
	const scope = textArray([project.id]);
	const counted = await rows<{ n: number }>(
		tx,
		sql`SELECT count(*)::int AS n FROM tickets WHERE project_id = ANY(${scope})`,
	);
	const tickets = counted[0]!.n;
	// The project delete cascades to `flows`, and a flow holds a briefing and
	// a whole graph of steps that nothing else keeps. The count goes in the
	// refusal, so a person reads what the delete takes with it.
	const deletedFlows = await rows<{ id: string }>(tx, sql`SELECT id FROM flows WHERE project_id = ANY(${scope})`);
	const flows = deletedFlows.length;
	if (!force && (tickets > 0 || flows > 0)) throw fail("PROJECT_NOT_EMPTY", { tickets, flows });
	// The parent foreign key is RESTRICT, so one DELETE cannot remove a
	// ticket and the ticket that names it as its parent. Clearing the links
	// first lets the DELETE below take every row.
	await tx.execute(
		sql`UPDATE tickets SET parent_id = NULL
			WHERE parent_id IN (SELECT id FROM tickets WHERE project_id = ANY(${scope}))`,
	);
	const blobs = await rows<{ sha256: string }>(
		tx,
		sql`SELECT DISTINCT a.sha256 FROM attachments a JOIN tickets t ON t.id = a.ticket_id
			WHERE t.project_id = ANY(${scope})`,
	);
	const pageBlobs = await pageObjects(tx, project.id);
	const resourceBlobs = await resourceBlobShasOfProjects(tx, [project.id]);
	await tx.execute(sql`DELETE FROM tickets WHERE project_id = ANY(${scope})`);
	ctx.dropBlobs([...blobs.map((blob) => blob.sha256), ...resourceBlobs]);
	await tx.execute(
		sql`DELETE FROM pull_requests pr
			WHERE NOT pr.review_retained AND NOT EXISTS (SELECT 1 FROM ticket_pull_requests l WHERE l.pull_request_id = pr.id)`,
	);
	await tx.execute(sql`DELETE FROM projects WHERE id = ANY(${scope})`);
	ctx.dropPageObjects(pageBlobs.map((object) => object.sha256));
	await ctx.cache.rebuild(tx);
	ctx.emit({ type: "project.deleted", id: project.id });
	// `project.deleted` refreshes no flow list, so an open flows page would
	// keep a card for a flow the cascade deleted. `flows.changed` carries the
	// id of one flow, so the delete emits one event per flow it took.
	for (const flow of deletedFlows) ctx.emit({ type: "flows.changed", id: flow.id });
	return { deleted: project.key };
};

export { remove as delete };
