import { sql } from "drizzle-orm";
import type { Tx } from "../../tx.ts";
import { rows } from "../support.ts";

// The rows that name a host. Each foreign key to `hosts` is NO ACTION, so a
// host with any count above zero cannot be deleted. `workspaceDefault` is
// true when `workspace_control.default_host_id` names the host.
export type HostReferences = {
	runs: number;
	attempts: number;
	flows: number;
	accounts: number;
	projectPaths: number;
	projectDefaults: number;
	ticketPreferences: number;
	workspaceDefault: boolean;
};

export const hostReferences = async (tx: Tx, input: { id: string }): Promise<HostReferences> => {
	const found = await rows<HostReferences>(
		tx,
		sql`
		SELECT
			(SELECT count(*)::int FROM agent_runs WHERE host_id = ${input.id}) AS runs,
			(SELECT count(*)::int FROM agent_execution_attempts WHERE host_id = ${input.id}) AS attempts,
			(SELECT count(*)::int FROM flow_executions WHERE host_id = ${input.id}) AS flows,
			(SELECT count(*)::int FROM harness_accounts WHERE host_id = ${input.id}) AS accounts,
			(SELECT count(*)::int FROM project_host_paths WHERE host_id = ${input.id}) AS "projectPaths",
			(SELECT count(*)::int FROM projects WHERE default_host_id = ${input.id}) AS "projectDefaults",
			(SELECT count(*)::int FROM tickets WHERE host_id = ${input.id}) AS "ticketPreferences",
			EXISTS (SELECT 1 FROM workspace_control WHERE default_host_id = ${input.id}) AS "workspaceDefault"
	`,
	);
	return found[0]!;
};

// `missing`: no host has the id. `local`: the host is the local host, which
// stays for the life of the workspace. `referenced`: at least one row names
// the host, and `references` holds the counts.
export type DeleteHostResult =
	| { deleted: true }
	| { deleted: false; reason: "missing" }
	| { deleted: false; reason: "local" }
	| { deleted: false; reason: "referenced"; references: HostReferences };

const referenced = (references: HostReferences) =>
	references.workspaceDefault || Object.values(references).some((value) => typeof value === "number" && value > 0);

// The caller runs this inside one transaction. If another transaction commits
// a reference after hostReferences, the foreign key makes this DELETE fail.
export const deleteHost = async (tx: Tx, input: { id: string }): Promise<DeleteHostResult> => {
	const host = await rows<{ local: boolean }>(tx, sql`SELECT local FROM hosts WHERE id = ${input.id}`);
	if (host.length === 0) return { deleted: false, reason: "missing" };
	if (host[0]!.local) return { deleted: false, reason: "local" };
	const references = await hostReferences(tx, input);
	if (referenced(references)) return { deleted: false, reason: "referenced", references };
	await tx.execute(sql`DELETE FROM hosts WHERE id = ${input.id}`);
	return { deleted: true };
};
