import { join } from "node:path";
import { sql } from "drizzle-orm";
import { pathsCte, rows } from "../../db/queries/support.ts";
import type { Tx } from "../../db/tx.ts";
import type { UsageProject, UsageRun } from "./aggregate.ts";
import type { UsageAccountRow } from "./roots.ts";

// Every account, archived ones included: an archived account keeps its
// transcripts on disk, and its name still belongs on the rows it produced.
export const listUsageAccounts = (tx: Tx) =>
	rows<UsageAccountRow>(tx, sql`SELECT name, harness, profile_path AS "profilePath" FROM harness_accounts`);

type RunRow = Omit<UsageRun, "workDir">;

// Every native run that was open at some point after `cutoff`. The
// worktree of a run lives under `agents/<run id>/work` in the data home.
export const listUsageRuns = async (tx: Tx, home: string, cutoff: Date): Promise<UsageRun[]> => {
	const result = await rows<RunRow>(
		tx,
		sql`SELECT r.id, r.kind, r.persona_name AS "personaName", r.ticket_identifier AS "ticketIdentifier",
			t.title AS "ticketTitle", r.project_path AS "projectPath", coalesce(p.name, r.project_path) AS "projectName",
			a.name AS "accountName", r.session_id AS "sessionId"
		FROM agent_runs r
		LEFT JOIN tickets t ON t.id = r.ticket_id
		LEFT JOIN projects p ON p.id = r.project_id
		LEFT JOIN harness_accounts a ON a.id = r.account_id
		WHERE r.runtime = 'native' AND (r.closed_at IS NULL OR r.closed_at >= ${cutoff})`,
	);
	return result.map((run) => ({ ...run, workDir: join(home, "agents", run.id, "work") }));
};

type ProjectRow = { id: string; parentId: string | null; path: string; name: string; directory: string };

// Every project with its path and the repository directory its agents use.
// A project with no directory of its own uses the nearest ancestor that
// has one, which is the rule the agent launch applies.
export const listUsageProjects = async (tx: Tx): Promise<UsageProject[]> => {
	const result = await rows<ProjectRow>(
		tx,
		sql`WITH RECURSIVE ${pathsCte}
		SELECT p.id, p.parent_id AS "parentId", pp.path, p.name, coalesce(p.manager_config->>'directory', '') AS directory
		FROM projects p JOIN paths pp ON pp.id = p.id`,
	);
	const byId = new Map(result.map((project) => [project.id, project]));
	const resolve = (project: ProjectRow): string => {
		let current: ProjectRow | undefined = project;
		while (current) {
			if (current.directory !== "") return current.directory;
			current = current.parentId === null ? undefined : byId.get(current.parentId);
		}
		return "";
	};
	return result.map((project) => ({ path: project.path, name: project.name, directory: resolve(project) }));
};
