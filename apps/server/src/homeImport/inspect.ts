import { ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import { rows } from "../db/queries/support.ts";
import type { Tx } from "../db/tx.ts";
import { readAgentSettings } from "../services/agentSettings.ts";
import { version } from "../services/nativeMigration/version.ts";
import { activeRuntimeOwners } from "../services/runtimeOwnership.ts";
import type { ImportInventory } from "./types.ts";
export const inspect = async (tx: Tx): Promise<ImportInventory> => {
	const projects = await rows<{ id: string; manager_config: unknown }>(
		tx,
		sql`SELECT id,manager_config FROM projects ORDER BY id`,
	);
	const blockers: string[] = [];
	for (const project of projects)
		for (const owner of await activeRuntimeOwners(tx, project.id))
			blockers.push(`Stop or reconcile ${owner.source} agent ${owner.id} (${owner.state}) in project ${project.id}.`);
	const deliveries = await rows<{ id: string; state: string; source: string }>(
		tx,
		sql`SELECT id,state,'manager' AS source FROM manager_dispatches WHERE state <> 'sent' AND NOT (state='pending' AND run_id IS NULL) UNION ALL SELECT id,state,'review' AS source FROM review_deliveries WHERE state <> 'sent' ORDER BY id`,
	);
	for (const delivery of deliveries)
		blockers.push(`Resolve ${delivery.source} delivery ${delivery.id} (${delivery.state}) before import or rollback.`);
	const flows = await rows<{ id: string }>(
		tx,
		sql`SELECT id FROM flow_executions WHERE state->>'status' IN ('running','waiting') OR EXISTS (SELECT 1 FROM jsonb_array_elements(state->'steps') AS step WHERE step->>'needsStop'='true') ORDER BY id`,
	);
	for (const flow of flows) blockers.push(`Stop or reconcile flow ${flow.id} before import or rollback.`);
	const checks = await rows<{ id: string; state: string }>(
		tx,
		sql`SELECT id,document->>'state' AS state FROM evidence_checks WHERE document->>'state' IN ('starting','running','unknown') ORDER BY id`,
	);
	for (const check of checks)
		blockers.push(`Stop or reconcile check ${check.id} (${check.state}) before import or rollback.`);
	const workspaceReferences = await rows<ImportInventory["workspaceReferences"][number]>(
		tx,
		sql`SELECT id,runner AS runtime,workspace_id AS "workspaceId",claude_session_id AS "conversationId" FROM agent_sessions UNION ALL SELECT id,runtime,workspace_id AS "workspaceId",session_id AS "conversationId" FROM agent_runs ORDER BY id`,
	);
	const [counts] = await rows<ImportInventory["counts"]>(
		tx,
		sql`SELECT (SELECT count(*)::int FROM projects) AS projects,(SELECT count(*)::int FROM tickets) AS tickets,((SELECT count(*)::int FROM agent_sessions)+(SELECT count(*)::int FROM agent_runs)) AS agents,(SELECT count(*)::int FROM attachments) AS attachments,(SELECT count(*)::int FROM evidence_artifacts) AS artifacts,(SELECT count(*)::int FROM evidence_checks) AS checks`,
	);
	const agents = await readAgentSettings(tx);
	const [native] = await rows<{ value: boolean }>(tx, sql`SELECT value FROM settings WHERE key='nativeWorkPaused'`);
	return {
		counts: counts!,
		blockers,
		workspaceReferences,
		original: {
			projects: projects.map((project) => {
				const config = ProjectManagerConfigSchema.parse(project.manager_config);
				return {
					id: project.id,
					configHash: version(project.manager_config),
					ade: config.ade,
					directory: config.directory,
					dispatchPaused: config.dispatchPaused,
					trustedDirectory: config.trustedDirectory,
				};
			}),
			settings: {
				agentsEnabled: agents.enabled,
				agentsHash: version(agents),
				nativeWorkPaused: native?.value === true,
			},
		},
	};
};
