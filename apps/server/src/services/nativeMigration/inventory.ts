import { type NativeMigration, type NativeMigrationInventory, ProjectManagerConfigSchema } from "@trellis/api";
import { sql } from "drizzle-orm";
import type { ServiceCtx } from "../../context.ts";
import { iso, rows, textArray } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import { resolveProject } from "../refs.ts";
import { activeRuntimeOwners } from "../runtimeOwnership.ts";
import { version } from "./version.ts";

export const inventory = async (
	ctx: ServiceCtx,
	tx: Tx,
	input: { project: string },
): Promise<NativeMigrationInventory> => {
	const project = await resolveProject(ctx, tx, input.project);
	const projects = await rows<NativeMigrationInventory["projects"][number]>(
		tx,
		sql`WITH RECURSIVE scope AS (
 SELECT id FROM projects WHERE id=${project.id} UNION SELECT p.id FROM projects p JOIN scope s ON p.parent_id=s.id
 ) SELECT p.id,p.parent_id AS "parentId",p.name,p.manager_config AS config,${iso(sql`p.updated_at`)} AS "updatedAt" FROM projects p JOIN scope s ON p.id=s.id ORDER BY p.id`,
	);
	const ids = textArray(projects.map((p) => p.id));
	const agents = await rows<NativeMigrationInventory["agents"][number]>(
		tx,
		sql`
 SELECT id,project_id AS "projectId",'legacy' AS source,state,runner AS runtime,role,workspace_id AS "workspaceId",terminal_id AS "terminalId",claude_session_id AS "conversationId" FROM agent_sessions WHERE project_id=ANY(${ids})
 UNION ALL
 SELECT id,project_id AS "projectId",'persona' AS source,state,runtime,kind AS role,workspace_id AS "workspaceId",terminal_id AS "terminalId",session_id AS "conversationId" FROM agent_runs WHERE project_id=ANY(${ids}) ORDER BY id,source`,
	);
	const deliveries = await rows<NativeMigrationInventory["deliveries"][number]>(
		tx,
		sql`
 SELECT id,project_id AS "projectId",'manager' AS source,run_id AS "runId",state,generation,terminal_id AS "terminalId" FROM manager_dispatches WHERE project_id=ANY(${ids})
 UNION ALL
 SELECT d.id,r.project_id AS "projectId",'review' AS source,d.run_id AS "runId",d.state,d.attempt AS generation,r.terminal_id AS "terminalId" FROM review_deliveries d JOIN agent_runs r ON r.id=d.run_id WHERE r.project_id=ANY(${ids}) ORDER BY id,source`,
	);
	const flows = await rows<NativeMigrationInventory["flows"][number]>(
		tx,
		sql`SELECT id,project_id AS "projectId",revision,state FROM flow_executions WHERE project_id=ANY(${ids}) ORDER BY id`,
	);
	const checks = await rows<NativeMigrationInventory["checks"][number]>(
		tx,
		sql`SELECT c.id,r.project_id AS "projectId",c.run_id AS "runId",c.attempt_id AS "attemptId",c.document->>'state' AS state FROM evidence_checks c JOIN agent_runs r ON r.id=c.run_id WHERE r.project_id=ANY(${ids}) ORDER BY c.id`,
	);
	const history = await rows<{ document: NativeMigration }>(
		tx,
		sql`SELECT document FROM native_migrations WHERE project_id=ANY(${ids}) ORDER BY id`,
	);
	const blockers: NativeMigrationInventory["blockers"] = [];
	for (const scoped of projects) {
		const owners = await activeRuntimeOwners(tx, scoped.id);
		for (const owner of owners)
			blockers.push({
				id: owner.id,
				projectId: scoped.id,
				kind: "agent",
				reason: `Stop or reconcile ${owner.source} agent ${owner.id} (${owner.state}) in project ${scoped.id}.`,
			});
	}
	for (const delivery of deliveries) {
		if (
			delivery.state === "sent" ||
			(delivery.source === "manager" && delivery.state === "pending" && delivery.runId === null)
		)
			continue;
		blockers.push({
			id: delivery.id,
			projectId: delivery.projectId,
			kind: "delivery",
			reason: `Resolve ${delivery.source} delivery ${delivery.id} (${delivery.state}) for run ${delivery.runId ?? "unassigned"} in project ${delivery.projectId}.`,
		});
	}
	for (const flow of flows) {
		const steps = flow.state.steps as { needsStop: boolean }[];
		if (!["running", "waiting"].includes(flow.state.status as string) && !steps.some((step) => step.needsStop))
			continue;
		blockers.push({
			id: flow.id,
			projectId: flow.projectId,
			kind: "flow",
			reason: `Stop or reconcile flow ${flow.id} (${flow.state.status}) in project ${flow.projectId}.`,
		});
	}
	for (const check of checks) {
		if (!["starting", "running", "unknown"].includes(check.state)) continue;
		blockers.push({
			id: check.id,
			projectId: check.projectId,
			kind: "check",
			reason: `Stop or reconcile check ${check.id} (${check.state}) for run ${check.runId} in project ${check.projectId}.`,
		});
	}
	const originalConfig = projects.find((p) => p.id === project.id)!.config;
	const snapshot = {
		projectId: project.id,
		originalConfig,
		managerConfig: ProjectManagerConfigSchema.parse(originalConfig),
		projects,
		agents,
		deliveries,
		flows,
		checks,
		migrations: history.map((row) => row.document),
		blockers,
	};
	return { ...snapshot, version: version(snapshot) };
};
