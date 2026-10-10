import { afterAll, expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { UlidSchema } from "@trellis/api";
import type { Db } from "../client.ts";
import { migrate } from "../migrate.ts";
import { localHost } from "../queries/hosts/index.ts";
import { openTestDbFromArchive } from "../testDb.ts";
import { migrateHostsUpgrade, openPriorDatabase, originalRows } from "./history.ts";

let db: Db;
let directory: string;
afterAll(async () => {
	await db?.$client.close();
	if (directory) await rm(directory, { recursive: true });
});

const TABLES = [
	"projects",
	"statuses",
	"tickets",
	"agent_runs",
	"agent_execution_attempts",
	"flow_executions",
	"harness_accounts",
	"sessions",
	"settings",
];

const seed = `
	INSERT INTO projects (id, key, slug, name, directory, created_at, updated_at)
	VALUES ('project', 'HOST', 'host', 'Hosts', '/repos/trellis', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z'),
		('empty', 'EMP', 'empty', 'No directory', '', '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');
	INSERT INTO statuses (id, project_id, name, slug, category, color, position, created_at, updated_at)
	VALUES ('status', 'project', 'Todo', 'todo', 'todo', 'gray', 0, '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');
	INSERT INTO tickets (id, project_id, number, title, status_id, position, created_at, updated_at)
	VALUES ('ticket', 'project', 1, 'Store hosts', 'status', 1024, '2026-10-01T10:00:00Z', '2026-10-01T10:00:00Z');
	INSERT INTO agent_runs
		(id, name, kind, instruction, project_id, project_key, ticket_id, harness, session_id, workspace_id, terminal_id,
		 launched_at, created_at, updated_at)
	VALUES ('run-live', 'Builder', 'agent', 'Build it', 'project', 'HOST', 'ticket', '{"preset":"claude"}',
		'provider-session', '/workspaces/run-live', 'terminal-1', '2026-10-01T10:01:00Z',
		'2026-10-01T10:00:00Z', '2026-10-01T10:05:00Z');
	INSERT INTO agent_runs (id, name, kind, instruction, project_key, created_at, updated_at)
	VALUES ('run-session', 'Research', 'session', 'Compare options', '', '2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z');
	INSERT INTO agent_execution_attempts (id, run_id, generation, token_hash, created_at)
	VALUES ('attempt-1', 'run-live', 1, 'hash-1', '2026-10-01T10:00:30Z'),
		('attempt-2', 'run-live', 2, 'hash-2', '2026-10-01T10:03:00Z');
	INSERT INTO flow_executions
		(id, flow_id, ticket_id, project_id, actor_kind, actor_name, request_id, request, doc, state, revision,
		 created_at, updated_at)
	VALUES ('flow', 'review', 'ticket', 'project', 'human', 'navid', 'request-1', '{"ticket":"HOST-1"}',
		'{"nodes":[]}', '{"status":"running"}', 3, '2026-10-01T11:00:00Z', '2026-10-01T11:30:00Z');
	INSERT INTO harness_accounts (id, name, harness, profile_path, is_default, created_at, updated_at)
	VALUES ('account', 'Work', 'claude', '/profiles/work', true, '2026-09-01T10:00:00Z', '2026-09-01T10:00:00Z');
	INSERT INTO sessions (id, name, directory, harness, run_id, created_at, updated_at)
	VALUES ('session', 'Research', '/sessions/research', '{"preset":"claude"}', 'run-session',
		'2026-10-02T10:00:00Z', '2026-10-02T10:00:00Z');
	INSERT INTO settings (key, value, updated_at) VALUES ('theme', '{"mode":"dark"}', '2026-10-01T09:00:00Z');
`;

const hostIds = async (database: Db) =>
	(
		await database.$client.query<{ table: string; host_id: string }>(`
		SELECT 'agent_runs' AS table, host_id FROM agent_runs
		UNION ALL SELECT 'agent_execution_attempts', host_id FROM agent_execution_attempts
		UNION ALL SELECT 'flow_executions', host_id FROM flow_executions
		UNION ALL SELECT 'harness_accounts', host_id FROM harness_accounts
	`)
	).rows;

test("0152 keeps every row and binds each reference to the local host", async () => {
	({ db, directory } = await openPriorDatabase());
	await db.$client.exec(seed);
	const before = await originalRows(db, TABLES);
	expect(await migrateHostsUpgrade(db, directory)).toBe(1);
	expect(await originalRows(db, TABLES)).toEqual(before);

	const hosts = (await db.$client.query("SELECT id, name, kind, local, state, revision FROM hosts")).rows;
	expect(hosts).toHaveLength(1);
	expect(hosts[0]).toMatchObject({ name: "Execution host", kind: "local", local: true, state: "active", revision: 1 });
	const local = await db.transaction((tx) => localHost(tx));
	expect(UlidSchema.safeParse(local.id).success).toBe(true);

	const references = await hostIds(db);
	expect(references).toHaveLength(6);
	for (const row of references) expect(row.host_id, row.table).toBe(local.id);

	const controlRows = (
		await db.$client.query("SELECT id, controller_owner_epoch, default_host_id FROM workspace_control")
	).rows;
	expect(controlRows).toHaveLength(1);
	expect(controlRows[0]).toMatchObject({ controller_owner_epoch: 1, default_host_id: local.id });
	expect(UlidSchema.safeParse((controlRows[0] as { id: string }).id).success).toBe(true);

	const paths = (await db.$client.query("SELECT project_id, host_id, directory FROM project_host_paths")).rows;
	expect(paths).toEqual([{ project_id: "project", host_id: local.id, directory: "/repos/trellis" }]);

	const preferences = (
		await db.$client.query(`
		SELECT (SELECT host_id FROM tickets WHERE id = 'ticket') AS ticket,
			(SELECT default_host_id FROM projects WHERE id = 'project') AS project
	`)
	).rows[0];
	expect(preferences).toEqual({ ticket: null, project: null });

	const profileIndex = (
		await db.$client.query<{ indexdef: string }>(
			"SELECT indexdef FROM pg_indexes WHERE indexname = 'harness_accounts_profile_idx'",
		)
	).rows[0]!.indexdef;
	expect(profileIndex).toContain("(host_id, harness, profile_path)");

	await db.$client.exec(
		"INSERT INTO agent_runs (id, name, kind, instruction, project_key, created_at, updated_at) VALUES ('run-new', 'New', 'session', 'Later', '', now(), now())",
	);
	expect((await db.$client.query("SELECT host_id FROM agent_runs WHERE id = 'run-new'")).rows[0]).toEqual({
		host_id: local.id,
	});
	expect(await migrateHostsUpgrade(db, directory)).toBe(0);

	const saved = await originalRows(db, TABLES);
	const archive = await db.$client.dumpDataDir("none");
	await db.$client.close();
	db = await openTestDbFromArchive(archive);
	expect(await migrate(db)).toBe(0);
	expect(await originalRows(db, TABLES)).toEqual(saved);
	expect(await db.transaction((tx) => localHost(tx))).toEqual(local);
}, 120_000);
