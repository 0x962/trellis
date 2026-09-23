import { join } from "node:path";
import { sql } from "drizzle-orm";
import { rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { UsageProject, UsageRun } from "./aggregate.ts";
import type { UsageAccountRow } from "./roots.ts";

// Every account, archived ones included: an archived account keeps its
// transcripts on disk, and its name still belongs on the rows it produced.
export const listUsageAccounts = (tx: Tx) =>
	rows<UsageAccountRow>(
		tx,
		sql`SELECT name, harness, profile_path AS "profilePath", (is_default AND archived_at IS NULL) AS "isDefault" FROM harness_accounts`,
	);

type RunRow = Omit<UsageRun, "workDir">;

// Every native run that was open at some point after `cutoff`. The
// worktree of a run lives under `agents/<run id>/work` in the data home.
export const listUsageRuns = async (tx: Tx, home: string, cutoff: Date): Promise<UsageRun[]> => {
	const result = await rows<RunRow>(
		tx,
		sql`SELECT r.id, r.kind, r.name, r.ticket_identifier AS "ticketIdentifier",
			t.title AS "ticketTitle", r.project_key AS "projectKey", coalesce(p.name, r.project_key) AS "projectName",
			a.name AS "accountName", r.session_id AS "sessionId"
		FROM agent_runs r
		LEFT JOIN tickets t ON t.id = r.ticket_id
		LEFT JOIN projects p ON p.id = r.project_id
		LEFT JOIN harness_accounts a ON a.id = r.account_id
		WHERE r.runtime = 'native' AND (r.closed_at IS NULL OR r.closed_at >= ${cutoff})`,
	);
	return result.map((run) => ({ ...run, workDir: join(home, "agents", run.id, "work") }));
};

type ProjectRow = { id: string; key: string; name: string; directory: string };

// Every project with its key and the repository directory its agents use.
export const listUsageProjects = async (tx: Tx): Promise<UsageProject[]> => {
	const result = await rows<ProjectRow>(tx, sql`SELECT p.id, p.key, p.name, p.directory FROM projects p`);
	return result.map((project) => ({ key: project.key, name: project.name, directory: project.directory }));
};
