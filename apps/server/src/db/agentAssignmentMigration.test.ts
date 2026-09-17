import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import { openDb } from "./client.ts";

const migrationsDir = join(import.meta.dir, "../../drizzle");

test("the agent assignment migration preserves prompts and one ticket assignment", async () => {
	const db = await openDb(":memory:");
	try {
		const oldMigrations = readdirSync(migrationsDir)
			.filter((name) => /^\d{4}.*\.sql$/.test(name) && Number(name.slice(0, 4)) < 70)
			.sort();
		for (const migration of oldMigrations) {
			await db.$client.exec(readFileSync(join(migrationsDir, migration), "utf8"));
		}

		await db.$client.exec(`
			INSERT INTO personas (id, name, kind, instruction, created_at, updated_at) VALUES
				('manager-persona', 'Manager', 'manager', 'Manage this project.', now(), now()),
				('node-persona', 'Writer', 'builder', 'Write the draft.', now(), now());
			INSERT INTO projects (id, root_id, key, slug, name, manager_config, created_at, updated_at)
			VALUES (
				'project', 'project', 'TST', 'test', 'Test',
				'{"personaId":"manager-persona","directory":"/repo","concurrencyLimit":2,"builder":{"harness":"claude"}}',
				now(), now()
			);
			INSERT INTO statuses (
				id, project_id, name, slug, category, color, position, agent_config, is_default, created_at, updated_at
			) VALUES (
				'status', 'project', 'Todo', 'todo', 'todo', 'fg-muted', 0,
				'{"personaId":"node-persona"}', true, now(), now()
			);
			UPDATE statuses
			SET description = 'New work. Read it, ask in a comment when it is unclear, then start a builder.'
			WHERE id = 'status';
			INSERT INTO tickets (id, project_id, root_id, number, title, status_id, position, created_at, updated_at)
			VALUES ('ticket', 'project', 'project', 1, 'Test ticket', 'status', 0, now(), now());
			INSERT INTO flows (id, slug, name, created_at, updated_at)
			VALUES ('flow', 'draft', 'Draft', now(), now());
			INSERT INTO flow_nodes (id, flow_id, kind, title, persona_id, instruction, x, y)
			VALUES ('node', 'flow', 'agent', 'Draft', 'node-persona', 'Use the ticket context.', 0, 0);
			INSERT INTO flow_executions (
				id, flow_id, ticket_id, project_id, default_persona_id, actor_kind, actor_name,
				request_id, request, doc, personas, state, revision, created_at, updated_at
			) VALUES (
				'execution', 'flow', 'ticket', 'project', 'manager-persona', 'human', 'Test',
				'request', '{"defaultPersonaId":"manager-persona"}',
				'{"nodes":[{"id":"node","kind":"agent","title":"Draft","personaId":"node-persona","instruction":"Use the frozen context."}]}',
				'{"manager-persona":{"instruction":"Frozen manager prompt."},"node-persona":{"instruction":"Frozen node prompt."}}',
				'{}', 1, now(), now()
			);
			INSERT INTO agent_runs (
				id, name, persona_id, persona_name, kind, instruction, project_id, project_path,
				ticket_id, ticket_identifier, created_at, updated_at
			) VALUES
				('older-agent', 'Writer', 'node-persona', 'Writer', 'builder', 'Old task', 'project', 'Test', 'ticket', 'TST-1', now() - interval '1 minute', now()),
				('newer-agent', 'Writer', 'node-persona', 'Writer', 'reviewer', 'New task', 'project', 'Test', 'ticket', 'TST-1', now(), now());
		`);

		await db.$client.exec(readFileSync(join(migrationsDir, "0070_dear_nova.sql"), "utf8"));

		const projects = await db.execute(sql`SELECT manager_config FROM projects WHERE id = 'project'`);
		expect(projects.rows[0]!.manager_config).toEqual({
			directory: "/repo",
			concurrencyLimit: 2,
			instruction: "Manage this project.",
		});

		const nodes = await db.execute(sql`SELECT instruction FROM flow_nodes WHERE id = 'node'`);
		expect(nodes.rows[0]!.instruction).toBe("Write the draft.\n\nUse the ticket context.");
		const statuses = await db.execute(sql`SELECT description FROM statuses WHERE id = 'status'`);
		expect(statuses.rows[0]!.description).toBe("Work has not started.");

		const executions = await db.execute(sql`SELECT request, doc FROM flow_executions WHERE id = 'execution'`);
		expect(executions.rows[0]!.request).toEqual({});
		expect(executions.rows[0]!.doc).toEqual({
			nodes: [
				{
					id: "node",
					kind: "agent",
					title: "Draft",
					instruction: "Frozen node prompt.\n\nUse the frozen context.",
				},
			],
		});

		const assignments = await db.execute(
			sql`SELECT id, kind, closed_at FROM agent_runs WHERE ticket_id = 'ticket' ORDER BY created_at`,
		);
		expect(assignments.rows).toEqual([
			{ id: "older-agent", kind: "agent", closed_at: expect.any(String) },
			{ id: "newer-agent", kind: "agent", closed_at: null },
		]);
		await expect(
			db.$client.exec(`
				INSERT INTO agent_runs (
					id, name, kind, instruction, project_id, project_path,
					ticket_id, ticket_identifier, created_at, updated_at
				) VALUES ('third-agent', 'Agent', 'agent', '', 'project', 'Test', 'ticket', 'TST-1', now(), now())
			`),
		).rejects.toThrow("duplicate key value violates unique constraint");

		const removed = await db.execute(sql`
			SELECT
				to_regclass('personas') AS personas,
				to_regclass('column_workers') AS column_workers,
				to_regclass('builder_start_requests') AS builder_start_requests
		`);
		expect(removed.rows[0]).toEqual({ personas: null, column_workers: null, builder_start_requests: null });
	} finally {
		await db.$client.close();
	}
});
