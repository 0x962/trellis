import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { iso, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { list as listEpics } from "../epics/epics.ts";
import { activeNotes } from "../notes/notes.ts";
import { projectView } from "../projectRows.ts";
import { cell, progress, tableRows } from "./text.ts";

type Resource = {
	id: string;
	name: string;
	kind: string;
	epic: string;
	ticket: string | null;
	url: string | null;
	updated: string;
};

export async function projectContext(ctx: ServiceCtx, tx: Tx, input: { projectId: string; epicId: string | null }) {
	const project = await projectView(ctx, tx, input.projectId);
	const epics = await listEpics(ctx, tx, { project: project.id });
	const notes = await activeNotes(ctx, tx, { projectId: project.id, audience: "worker" });
	const resources = await rows<Resource>(
		tx,
		sql`SELECT r.id,r.name,r.kind,${project.key} || '/' || e.slug AS epic,
		p.key || '-' || t.number AS ticket,r.url,${iso(sql`r.updated_at`)} AS updated
		FROM epic_resources r JOIN epics e ON e.id=r.epic_id
		LEFT JOIN tickets t ON t.id=r.ticket_id LEFT JOIN projects p ON p.id=t.project_id
		WHERE e.project_id=${project.id} ORDER BY e.slug,r.created_at,r.id`,
	);
	return {
		"project.name": cell(project.name),
		"project.id": project.id,
		"project.key": project.key,
		"project.url": `${ctx.publicUrl}/p/${project.slug}`,
		"project.directory": cell(project.directory || "None"),
		"project.description": project.description || "None",
		"project.repository_rows": tableRows(
			project.repos.map((repo) => [
				repo.id,
				`${repo.owner}/${repo.repo}`,
				`https://github.com/${repo.owner}/${repo.repo}`,
			]),
			3,
		),
		"project.resource_rows": tableRows(
			resources.map((resource) => [
				resource.id,
				resource.name,
				resource.kind,
				resource.epic,
				resource.ticket,
				resource.url ?? `trellis resource list --epic ${resource.epic} --json`,
				resource.updated,
			]),
			7,
		),
		"project.status_rows": tableRows(
			project.statuses.map((status) => [
				status.id,
				status.name,
				status.slug,
				status.category,
				status.isDefault,
				status.description,
			]),
			6,
		),
		"project.instructions_and_notes":
			notes
				.map(
					(note) =>
						`### ${cell(note.title)}\n\nID: ${note.id}. Author: ${cell(note.actor.displayName ?? note.actor.name)}. Updated: ${note.updatedAt}.\n\n${note.body}`,
				)
				.join("\n\n") || "None",
		"epic.other_rows": tableRows(
			epics
				.filter((epic) => epic.id !== input.epicId)
				.map((epic) => [epic.id, epic.ref, epic.name, epic.state, epic.currentWave?.ref, progress(epic.counts)]),
			6,
		),
	};
}
