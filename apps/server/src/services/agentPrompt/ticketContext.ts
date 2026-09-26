import type { Ticket } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { chainRows } from "../../db/queries/chainRows.ts";
import { rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { epicView } from "../epics/epics.ts";
import { cell, progress, record, tableRows } from "./text.ts";

type Agent = { id: string; name: string; ticketId: string | null; attemptId: string | null; assigned: boolean };

export async function ticketContext(ctx: ServiceCtx, tx: Tx, ticket: Ticket) {
	const epic = ticket.epic === null ? null : await epicView(ctx, tx, ticket.epic.id);
	const wave = epic?.waves.find((wave) => wave.id === ticket.wave?.id);
	const agents = await rows<Agent>(
		tx,
		sql`SELECT id,name,ticket_id AS "ticketId",terminal_id AS "attemptId",closed_at IS NULL AS assigned
		FROM agent_runs WHERE project_id=${ticket.project.id} AND closed_at IS NULL ORDER BY created_at,id`,
	);
	const resources = await rows(
		tx,
		sql`SELECT id,name,kind,body,url,epic_id AS "epicId" FROM epic_resources WHERE ticket_id=${ticket.id} ORDER BY created_at,id`,
	);
	const threads = await rows(
		tx,
		sql`SELECT id,pr_id AS "diffId",document FROM review_threads WHERE pr_id=ANY(${textArray(ticket.prs.map((pr) => pr.id))}) ORDER BY updated_at,id`,
	);
	const flows = await rows(
		tx,
		sql`SELECT id,flow_id AS "flowId",diff_id AS "diffId",doc->'flow'->>'name' AS name,
		head_sha AS "headSha",state->>'status' AS status,state->>'failureKind' AS "failureKind",
		state->>'error' AS error FROM flow_executions
		WHERE ticket_id=${ticket.id} OR diff_id=ANY(${textArray(ticket.prs.map((pr) => pr.id))})
		ORDER BY created_at DESC,id DESC`,
	);
	const prior =
		epic === null
			? []
			: await rows(
					tx,
					sql`SELECT id,outcome FROM tickets WHERE epic_id=${epic.id} AND id<>${ticket.id} AND outcome<>'' ORDER BY number,id`,
				);
	return {
		...(epic === null
			? {}
			: {
					"epic.name": cell(epic.name),
					"epic.id": epic.id,
					"epic.ref": epic.ref,
					"epic.state": epic.state,
					"epic.progress": progress(epic.counts),
					"epic.description": epic.description || "None",
					"wave.other_rows": tableRows(
						epic.waves
							.filter((other) => other.id !== wave?.id)
							.map((other) => [other.id, other.ref, other.name, other.position, other.state, progress(other.counts)]),
						6,
					),
				}),
		...(wave === undefined
			? {}
			: {
					"wave.name": cell(wave.name),
					"wave.id": wave.id,
					"wave.ref": wave.ref,
					"wave.position": String(wave.position),
					"wave.state": wave.state,
					"wave.progress": progress(wave.counts),
					"ticket.wave_peer_rows": tableRows(
						epic!.tickets
							.filter((peer) => peer.wave?.id === wave.id && peer.id !== ticket.id)
							.map((peer) => [
								peer.id,
								peer.identifier,
								peer.title,
								peer.status.name,
								agents
									.filter((agent) => agent.ticketId === peer.id)
									.map((agent) => `${agent.name} (${agent.id})`)
									.join(", ") || "None",
								peer.waitsOn.map((dependency) => dependency.identifier).join(", ") || "None",
							]),
						6,
					),
				}),
		"ticket.identifier": ticket.identifier,
		"ticket.id": ticket.id,
		"ticket.title": cell(ticket.title),
		"ticket.url": `${ctx.publicUrl}/t/${ticket.identifier}`,
		"ticket.status": cell(`${ticket.status.name} (${ticket.status.slug}; ${ticket.status.category})`),
		"ticket.priority": String(ticket.priority),
		"ticket.labels": cell(ticket.labels.map((label) => label.name).join(", ") || "None"),
		"ticket.description": ticket.description || "None",
		"ticket.contract": record(ticket.contract),
		"ticket.dependencies_and_results": record({
			dependencies: await chainRows(tx, ticket.id),
			releases: ticket.releases,
			outcome: ticket.outcome,
			priorResults: prior,
		}),
		"ticket.parent_and_children": record({ parent: ticket.parent, children: ticket.children }),
		"ticket.attachments_and_resources": record({
			attachments: ticket.attachments.map((attachment) => ({
				...attachment,
				url: `${ctx.publicUrl}${attachment.url}`,
			})),
			resources,
		}),
		"ticket.diffs_and_reviews": record({
			diffs: ticket.prs.map((pr) => ({
				id: pr.id,
				url: pr.url,
				title: pr.title,
				state: pr.state,
				isDraft: pr.isDraft,
				localState: pr.localState,
				headRef: pr.headRef,
				baseRef: pr.baseRef,
				ciState: pr.ciState,
				checks: pr.checks.reduce(
					(checksByStatus, check) => {
						checksByStatus[check.bucket]++;
						return checksByStatus;
					},
					{ pass: 0, fail: 0, pending: 0, skipping: 0, cancel: 0 },
				),
				fetchedAt: pr.fetchedAt,
				fetchError: pr.fetchError,
				detailsCommand: `trellis diff show ${pr.url} --json`,
			})),
			detailsHint: "Diffs contain summaries. Use each detailsCommand for all checks, files, and review gaps.",
			flows,
			threads,
		}),
		"ticket.agents": record(agents.filter((agent) => agent.ticketId === ticket.id)),
	};
}
